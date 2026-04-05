"""Forge Trainer — In-memory job manager for tracking training lifecycle."""

import os
import shutil
import uuid
from datetime import datetime, timezone

from config import OUTPUT_DIR, COST_UAKT_PER_MINUTE


class JobManager:
    """Tracks training jobs in memory. Single-instance for FastAPI lifetime."""

    VALID_STATUSES = {"queued", "training", "merging", "complete", "failed"}

    def __init__(self) -> None:
        self._jobs: dict[str, dict] = {}

    def create_job(self, adapter_name: str, num_epochs: int = 3) -> str:
        """Create a new job, return job_id UUID string."""
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = {
            "job_id": job_id,
            "adapter_name": adapter_name,
            "status": "queued",
            "progress": 0.0,
            "current_epoch": 0,
            "total_epochs": num_epochs,
            "train_loss": None,
            "elapsed_seconds": 0,
            "estimated_remaining_seconds": None,
            "cost_uakt": 0,
            "merged_gguf_path": None,
            "merged_gguf_size_mb": None,
            "final_loss": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "error_message": None,
        }
        os.makedirs(os.path.join(OUTPUT_DIR, job_id), exist_ok=True)
        return job_id

    def update_status(
        self,
        job_id: str,
        status: str | None = None,
        progress: float | None = None,
        current_epoch: int | None = None,
        train_loss: float | None = None,
        elapsed_seconds: float | None = None,
        estimated_remaining_seconds: float | None = None,
        merged_gguf_path: str | None = None,
        final_loss: float | None = None,
        error_message: str | None = None,
    ) -> dict | None:
        """Update job fields. Returns updated job dict or None."""
        job = self._jobs.get(job_id)
        if job is None:
            return None

        if status is not None:
            if status not in self.VALID_STATUSES:
                raise ValueError(f"Invalid status: {status}")
            job["status"] = status
        if progress is not None:
            job["progress"] = progress
        if current_epoch is not None:
            job["current_epoch"] = current_epoch
        if train_loss is not None:
            job["train_loss"] = train_loss
        if elapsed_seconds is not None:
            job["elapsed_seconds"] = elapsed_seconds
        if estimated_remaining_seconds is not None:
            job["estimated_remaining_seconds"] = estimated_remaining_seconds
        if merged_gguf_path is not None:
            job["merged_gguf_path"] = merged_gguf_path
            if os.path.exists(merged_gguf_path):
                size_mb = os.path.getsize(merged_gguf_path) / (1024 * 1024)
                job["merged_gguf_size_mb"] = round(size_mb, 2)
        if final_loss is not None:
            job["final_loss"] = final_loss
        if error_message is not None:
            job["error_message"] = error_message

        # Update cost estimate based on elapsed time
        elapsed = job.get("elapsed_seconds", 0) or 0
        job["cost_uakt"] = int(elapsed / 60 * COST_UAKT_PER_MINUTE)

        return job

    def get_job(self, job_id: str) -> dict | None:
        """Return full job dict or None."""
        return self._jobs.get(job_id)

    def list_jobs(self) -> list[dict]:
        """Return list of all job dicts."""
        return list(self._jobs.values())

    def delete_job(self, job_id: str) -> bool:
        """Delete job files from disk and remove from memory."""
        job = self._jobs.pop(job_id, None)
        if job is None:
            return False
        job_dir = os.path.join(OUTPUT_DIR, job_id)
        if os.path.exists(job_dir):
            shutil.rmtree(job_dir)
        return True


# Singleton instance
job_manager = JobManager()
