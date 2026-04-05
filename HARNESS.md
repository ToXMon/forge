# Development Harness — Forge

Based on 0xSero's Agentic Coding 101 methodology.

## Sub-Agent Profiles and Behavioral Rules

### Engineering Agent (developer)
- Read AGENTS.md FIRST before writing any code
- Trainer: FastAPI service, NOT batch script. Must accept JSONL upload, train, merge to GGUF, serve download
- PWA: wllama WASM runtime for local inference. NO cloud API calls for inference
- CRITICAL: wllama does NOT support runtime LoRA loading. Trainer MUST merge LoRA into base model before download via Unsloth save_pretrained_gguf()
- File limits: 300 lines max per file, 20 files max per directory
- Autonomy: no questions mid-task, self-decide on ambiguity

### DevOps Agent (hacker)
- SDL must follow akash-deploy skill validation rules
- NEVER use :latest image tags
- denom: uact (user-confirmed)

## Architecture Constraints

### Trainer Service
- FastAPI on port 5000
- POST /train → accepts JSONL, returns job_id
- GET /status/{job_id} → returns training progress
- GET /download/{job_id} → returns merged GGUF file (~4.3GB)
- POST /merge → accepts base GGUF + LoRA adapter path, returns merged GGUF
- Base model: unsloth/Qwen2.5-7B-Instruct-bnb-4bit
- LoRA config: r=64, alpha=64, targets=qkv+o, 3 epochs, lr=1e-4
- Merge method: Unsloth model.merge_and_save() then GGUF export

### PWA (Pocket)
- Vanilla HTML/CSS/JS (no framework — keep it dead simple for mobile)
- wllama from CDN for WASM llama.cpp inference
- IndexedDB for storing downloaded GGUF personas
- No cloud inference — 100% local after download
- Dark theme, orange (#f97316) accent color

### Design Language (Crypto/Tech Twitter)
- Dark background (#0a0a0a), subtle borders (#1a1a1a)
- Monospace for cost/technical data, clean sans-serif for UI
- "$0.00015" front and center — the number sells itself
- No enterprise jargon, no marketing fluff
- MIT license badge, "built on Akash" badge, GitHub stars placeholder

## Reusable Code References
- Trainer pattern: /a0/usr/workdir/ghost-training-data/train.py (adapt from batch→API)
- Trainer Dockerfile: /a0/usr/workdir/ghost-training-data/Dockerfile.train
- PWA pattern: /a0/usr/workdir/repos/llamaedge-chat/ (adapt from cloud→local)
- SDL pattern: /a0/usr/workdir/gemma-llamaedge/deploy-gpu.yaml
- LlamaEdge Dockerfile: /a0/usr/workdir/gemma-llamaedge/Dockerfile

## Refactor Cadence (50/50 Rule)
After every 2 task files completed, review for:
1. File line counts exceeding 250 lines (split before hitting 300)
2. Duplicate code patterns (extract to shared module)
3. Unused imports or dead code

## AGENTS.md Hierarchy Standard
- Root: this HARNESS.md — behavioral rules, architecture constraints
- /a0/usr/workdir/forge/AGENTS.md — full API spec, data schemas, deployment config
- Update after every module modification
