"""Forge Trainer — Configuration defaults from AGENTS.md spec."""

# Base model
MODEL_NAME = "unsloth/Qwen2.5-7B-Instruct-bnb-4bit"

# LoRA config
LORA_R = 64
LORA_ALPHA = 64
LORA_TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj"]
LORA_DROPOUT = 0.05

# Training hyperparams
MAX_SEQ_LENGTH = 2048
LEARNING_RATE = 1e-4
BATCH_SIZE = 4
GRADIENT_ACCUMULATION_STEPS = 2  # effective batch = 8
NUM_EPOCHS = 3
WARMUP_RATIO = 0.03
LR_SCHEDULER_TYPE = "cosine"
OPTIMIZER = "adamw_8bit"
WEIGHT_DECAY = 0.01
LOGGING_STEPS = 10
SEED = 42
MAX_GRAD_NORM = 1.0

# GGUF export
GGUF_QUANTIZATION = "q4_k_m"
GGUF_QUANT_LABEL = "Q4_K_M"

# Paths
OUTPUT_DIR = "/output"
CHECKPOINT_DIR = "/tmp/forge-training-checkpoints"

# API
API_PORT = 5000
CORS_ORIGINS = ["*"]

# Cost estimation (uakt per training minute on Akash RTX 4090)
COST_UAKT_PER_MINUTE = 5
