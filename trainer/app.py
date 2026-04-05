"""Forge Trainer — FastAPI service for LoRA training + GGUF export.

Endpoints:
  POST /train       — submit JSONL, start training job
  GET  /status/{id}  — poll training progress
  GET  /download/{id} — download merged GGUF
  GET  /jobs         — list all jobs
  DELETE /job/{id}   — delete job and files
"""

import asyncio
import base64
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from config import API_PORT, CORS_ORIGINS, GGUF_QUANT_LABEL
from job_manager import job_manager
from train_pipeline import validate_data, run_training

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("forge-trainer")


# ── Request schemas ─────────────────────────────────────────────────────────

class TrainRequest(BaseModel):
    adapter_name: str = Field(..., min_length=1, max_length=64)
    data: str = Field(..., min_length=1)
    data_format: str = "jsonl"
    lora_r: int = 64
    lora_alpha: int = 64
    num_epochs: int = 3
    learning_rate: float = 1e-4


# ── Progress callback bridge ─────────────────────────────────────────────────

def _make_callback(job_id: str):
    """Return a callback that updates JobManager from the training thread."""
    def cb(jid, status=None, progress=0.0, current_epoch=None,
           train_loss=None, elapsed_seconds=None,
           estimated_remaining_seconds=None, merged_gguf_path=None,
           final_loss=None, error_message=None):
        job_manager.update_status(
            jid, status=status, progress=progress,
            current_epoch=current_epoch, train_loss=train_loss,
            elapsed_seconds=elapsed_seconds,
            estimated_remaining_seconds=estimated_remaining_seconds,
            merged_gguf_path=merged_gguf_path,
            final_loss=final_loss, error_message=error_message,
        )
    return cb


def _run_job(job_id: str, jsonl_data: str, adapter_name: str, overrides: dict):
    """Blocking function — runs in a thread via asyncio.to_thread."""
    callback = _make_callback(job_id)
    try:
        run_training(job_id, jsonl_data, adapter_name, overrides, callback)
    except Exception as e:
        logger.error("Job %s failed: %s", job_id, e)
        job_manager.update_status(job_id, status="failed", error_message=str(e))


# ── App lifecycle ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    os.makedirs("/output", exist_ok=True)
    logger.info("Forge Trainer ready on port %d", API_PORT)
    yield


app = FastAPI(title="Forge Trainer", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/train", status_code=202)
async def train(req: TrainRequest):
    # Decode base64 if explicitly requested
    data = req.data
    if req.data_format == "base64":
        try:
            data = base64.b64decode(data).decode("utf-8")
        except Exception as e:
            raise HTTPException(400, f"Invalid base64 data: {e}")

    # Validate before queueing
    try:
        entries = validate_data(data)
    except ValueError as e:
        raise HTTPException(400, str(e))

    job_id = job_manager.create_job(req.adapter_name, req.num_epochs)
    overrides = {
        "lora_r": req.lora_r, "lora_alpha": req.lora_alpha,
        "num_epochs": req.num_epochs, "learning_rate": req.learning_rate,
    }
    # Run training in background thread (blocking GPU work)
    asyncio.get_event_loop().run_in_executor(
        None, _run_job, job_id, data, req.adapter_name, overrides)

    return {
        "job_id": job_id,
        "status": "queued",
        "adapter_name": req.adapter_name,
        "estimated_time_minutes": 30,
        "sample_count": len(entries),
    }


@app.get("/status/{job_id}")
async def status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.get("/download/{job_id}")
async def download(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] != "complete" or not job.get("merged_gguf_path"):
        raise HTTPException(400, f"Job status is '{job['status']}', not 'complete'")
    gguf_path = job["merged_gguf_path"]
    filename = f"{job['adapter_name']}-merged-{GGUF_QUANT_LABEL}.gguf"
    return FileResponse(
        gguf_path,
        media_type="application/octet-stream",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/jobs")
async def jobs():
    return {"jobs": job_manager.list_jobs()}


@app.delete("/job/{job_id}")
async def delete_job(job_id: str):
    if not job_manager.delete_job(job_id):
        raise HTTPException(404, "Job not found")
    return {"deleted": job_id}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=API_PORT)
