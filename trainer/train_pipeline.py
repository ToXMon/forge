"""Forge Trainer — LoRA training + merge + GGUF export pipeline.

Adapted from ghost-training-data/train.py batch script into a callable
pipeline with progress callbacks for the FastAPI service layer.

CRITICAL: wllama cannot load LoRA adapters at runtime, so this pipeline
MUST merge LoRA into base model and export as GGUF server-side.
"""

import json
import os
import time
from datetime import datetime, timezone

from config import (
    MODEL_NAME, LORA_R, LORA_ALPHA, LORA_TARGET_MODULES, LORA_DROPOUT,
    MAX_SEQ_LENGTH, LEARNING_RATE, BATCH_SIZE, GRADIENT_ACCUMULATION_STEPS,
    NUM_EPOCHS, WARMUP_RATIO, LR_SCHEDULER_TYPE, OPTIMIZER, WEIGHT_DECAY,
    LOGGING_STEPS, SEED, MAX_GRAD_NORM, GGUF_QUANTIZATION, GGUF_QUANT_LABEL,
    OUTPUT_DIR, CHECKPOINT_DIR,
)


def validate_data(jsonl_data: str) -> list[dict]:
    """Parse JSONL string, return valid entries with messages array."""
    entries = []
    for line_num, line in enumerate(jsonl_data.strip().split("\n"), 1):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
            msgs = entry.get("messages", [])
            if isinstance(msgs, list) and len(msgs) >= 2:
                entries.append(entry)
        except json.JSONDecodeError:
            pass
    if not entries:
        raise ValueError("No valid JSONL entries found — each line needs a messages array")
    return entries


class ProgressCallback:
    """HuggingFace TrainerCallback that reports epoch progress."""

    def __init__(self, job_id: str, callback, total_epochs: int, start_time: float):
        self.job_id = job_id
        self.callback = callback
        self.total_epochs = total_epochs
        self.start_time = start_time
        self._last_loss = None

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs and "loss" in logs:
            self._last_loss = round(logs["loss"], 4)
        if state.epoch is not None:
            epoch = int(state.epoch)
            progress = min(epoch / self.total_epochs, 0.95)
            elapsed = time.time() - self.start_time
            rate = elapsed / max(epoch, 1)
            remaining = rate * (self.total_epochs - epoch)
            self.callback(
                self.job_id, status="training", progress=progress,
                current_epoch=epoch, train_loss=self._last_loss,
                elapsed_seconds=round(elapsed),
                estimated_remaining_seconds=round(remaining),
            )


def run_training(
    job_id: str,
    jsonl_data: str,
    adapter_name: str,
    config_overrides: dict | None = None,
    progress_callback=None,
) -> dict:
    """Full pipeline: validate → load → LoRA → train → merge → export GGUF.

    Args:
        job_id: UUID string from JobManager
        jsonl_data: Raw JSONL string with messages arrays
        adapter_name: Human-readable name for the output file
        config_overrides: Optional dict overriding config.py defaults
        progress_callback: Callable(job_id, status, progress, **kwargs)

    Returns:
        Stats dict with training results and file paths.
    """
    cfg = {**{
        "lora_r": LORA_R, "lora_alpha": LORA_ALPHA,
        "lora_target_modules": LORA_TARGET_MODULES, "lora_dropout": LORA_DROPOUT,
        "num_epochs": NUM_EPOCHS, "learning_rate": LEARNING_RATE,
        "max_seq_length": MAX_SEQ_LENGTH, "batch_size": BATCH_SIZE,
        "gradient_accumulation_steps": GRADIENT_ACCUMULATION_STEPS,
        "warmup_ratio": WARMUP_RATIO, "lr_scheduler_type": LR_SCHEDULER_TYPE,
        "optimizer": OPTIMIZER, "weight_decay": WEIGHT_DECAY,
        "logging_steps": LOGGING_STEPS, "seed": SEED, "max_grad_norm": MAX_GRAD_NORM,
        "gguf_quantization": GGUF_QUANTIZATION,
    }, **(config_overrides or {})}

    job_dir = os.path.join(OUTPUT_DIR, job_id)
    merged_path = os.path.join(job_dir, f"{adapter_name}-merged-{GGUF_QUANT_LABEL}.gguf")
    merged_model_dir = os.path.join(job_dir, "merged-model")
    start_time = time.time()
    stats = {"model": MODEL_NAME, "timestamp": datetime.now(timezone.utc).isoformat()}

    def _cb(status, progress=0.0, **kw):
        if progress_callback:
            progress_callback(job_id, status=status, progress=progress, **kw)

    try:
        # 1. Validate data
        _cb("training", 0.01)
        entries = validate_data(jsonl_data)
        stats["total_samples"] = len(entries)

        # 2. Load model + tokenizer
        from unsloth import FastLanguageModel
        _cb("training", 0.05)
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=MODEL_NAME,
            max_seq_length=cfg["max_seq_length"],
            dtype=None, load_in_4bit=True,
        )
        FastLanguageModel.for_inference(model)

        # 3. Add LoRA
        model = FastLanguageModel.get_peft_model(
            model, r=cfg["lora_r"], lora_alpha=cfg["lora_alpha"],
            lora_dropout=cfg["lora_dropout"],
            target_modules=cfg["lora_target_modules"],
            bias="none", use_gradient_checkpointing="unsloth",
            random_state=cfg["seed"], use_rslora=False, loftq_config=None,
        )

        # 4. Format dataset
        from datasets import Dataset
        formatted = []
        for entry in entries:
            msgs = entry["messages"]
            valid = all(
                msgs[i].get("role") == ("user" if i % 2 == 0 else "assistant")
                for i in range(len(msgs))
            )
            if valid:
                try:
                    text = tokenizer.apply_chat_template(
                        msgs, tokenize=False, add_generation_prompt=False)
                    formatted.append({"text": text})
                except Exception:
                    pass
        if not formatted:
            raise ValueError("No valid samples after chat template formatting")
        dataset = Dataset.from_list(formatted)

        # 5. Train
        from trl import SFTTrainer
        from transformers import TrainingArguments

        callback = ProgressCallback(
            job_id, progress_callback, cfg["num_epochs"], start_time)
        training_args = TrainingArguments(
            output_dir=CHECKPOINT_DIR,
            num_train_epochs=cfg["num_epochs"],
            per_device_train_batch_size=cfg["batch_size"],
            gradient_accumulation_steps=cfg["gradient_accumulation_steps"],
            learning_rate=cfg["learning_rate"],
            lr_scheduler_type=cfg["lr_scheduler_type"],
            warmup_ratio=cfg["warmup_ratio"], optim=cfg["optimizer"],
            weight_decay=cfg["weight_decay"], logging_steps=cfg["logging_steps"],
            save_strategy="no", bf16=True, seed=cfg["seed"],
            report_to="none", max_grad_norm=cfg["max_grad_norm"],
            dataset_text_field="text", max_seq_length=cfg["max_seq_length"],
            packing=False,
        )
        trainer = SFTTrainer(
            model=model, tokenizer=tokenizer, args=training_args,
            train_dataset=dataset, dataset_text_field="text",
            max_seq_length=cfg["max_seq_length"], packing=False,
            callbacks=[callback],
        )
        trainer.train()

        # Extract final loss
        final_loss = None
        for entry in reversed(trainer.state.log_history):
            if "loss" in entry:
                final_loss = round(entry["loss"], 4)
                break

        # 6. Merge LoRA into base model (writes to merged_model_dir)
        _cb("merging", 0.96)
        model.merge_and_save(merged_model_dir)
        tokenizer.save_pretrained(merged_model_dir)
        del model
        import torch
        torch.cuda.empty_cache()

        # 7. Export GGUF from merged model
        _cb("merging", 0.98)
        FastLanguageModel.save_pretrained_gguf(
            merged_model_dir, merged_path,
            quantization_method=cfg["gguf_quantization"],
        )

        # 8. Finalize
        elapsed = round(time.time() - start_time, 2)
        gguf_size_mb = round(os.path.getsize(merged_path) / (1024 * 1024), 2)

        stats.update({
            "lora_config": {"r": cfg["lora_r"], "alpha": cfg["lora_alpha"],
                "target_modules": cfg["lora_target_modules"]},
            "results": {"final_train_loss": final_loss,
                "training_time_seconds": elapsed,
                "training_time_minutes": round(elapsed / 60, 2),
                "gguf_size_mb": gguf_size_mb, "gguf_path": merged_path},
        })

        # Save stats JSON
        with open(os.path.join(job_dir, "stats.json"), "w") as f:
            json.dump(stats, f, indent=2, default=str)

        _cb("complete", 1.0, final_loss=final_loss,
            elapsed_seconds=elapsed, merged_gguf_path=merged_path)

        return stats

    except Exception as e:
        _cb("failed", progress=0.0, error_message=str(e))
        # Cleanup GPU on failure
        try:
            import torch
            torch.cuda.empty_cache()
        except Exception:
            pass
        raise
