<div align="center">

# 🔥 Forge

**Decentralized LoRA forge for sovereign mobile AI**

Train a personal AI adapter on Akash's decentralized GPUs for fractions of a cent,
download it to your phone, and run a personalized AI that never talks to the cloud.

[![MIT License](https://img.shields.io/badge/license-MIT-orange.svg)](LICENSE)
[![Built on Akash](https://img.shields.io/badge/built%20on-Akash-ff6b00.svg)](https://akash.network)

</div>

---

## The Problem

By 2026, your phone runs Qwen 3.5 9B at 40+ tokens/second. Faster than cloud APIs.
But the model doesn't know you. It doesn't write like you, doesn't remember your projects.

Fine-tuning would fix this — but your phone can't fine-tune. You need a GPU.
- **AWS**: $2.45 per session + content policy may reject your data
- **RunPod**: $0.37 per session + terms restrict certain content
- **Forge**: **$0.00015 per session** + no content policy + no account approval

## The Solution

Forge is a 3-layer system:

```
┌─────────────────────────────────────┐
│  🔨 FORGE (Akash GPU)               │
│  Upload data → Train LoRA → Merge   │
│  to GGUF → Download                 │
│  Cost: $0.00015/session             │
└──────────────┬──────────────────────┘
               │ ~4.3GB merged GGUF
               ▼
┌─────────────────────────────────────┐
│  📱 POCKET (Your Phone)             │
│  Load GGUF via wllama WASM          │
│  Chat 100% locally • Offline        │
│  No API key • No data leaves device │
└─────────────────────────────────────┘
```

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Forge** | FastAPI + Unsloth + Qwen2.5-7B | Train LoRA, merge to GGUF on Akash GPU |
| **Anvil** | LlamaEdge (Phase 2) | A/B test base vs personalized before download |
| **Pocket** | wllama WASM + IndexedDB | Run merged GGUF locally in browser |

### Why Server-Side Merge?
wllama does not support runtime LoRA adapter loading. The trainer fuses LoRA weights
into the base model via `model.merge_and_save()` then exports as GGUF via
`save_pretrained_gguf()`. The mobile device receives a standard GGUF file.

## Cost Comparison

| Provider | Per Session | Monthly (100 trains) |
|----------|-------------|---------------------|
| AWS H100 | $2.45 | $735 |
| RunPod A6000 | $0.37 | $111 |
| **Forge (Akash)** | **$0.00015** | **$0.015** |

## Project Structure

```
forge/
├── HARNESS.md          # Behavioral rules, architecture constraints
├── AGENTS.md           # Full API spec, data schemas, design system
├── trainer/
│   ├── app.py          # FastAPI — 5 endpoints
│   ├── train_pipeline.py  # LoRA train → merge → GGUF export
│   ├── job_manager.py  # In-memory job tracking
│   ├── config.py       # Training defaults
│   ├── Dockerfile      # unsloth/unsloth base
│   └── requirements.txt
├── pwa/
│   ├── index.html      # 3-view PWA shell
│   ├── manifest.json   # PWA metadata
│   ├── sw.js           # Service worker
│   ├── css/            # Dark theme design system
│   └── js/
│       ├── app.js      # Router, view switching
│       ├── forge.js    # Upload, train, download
│       ├── pocket.js   # wllama chat inference
│       ├── personas.js # Persona management
│       └── db.js       # IndexedDB wrapper
├── sdl/
│   └── deploy.yaml     # Akash deployment
└── README.md
```

## Trainer API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/train` | Start LoRA training job (202) |
| GET | `/status/{job_id}` | Training progress + loss |
| GET | `/download/{job_id}` | Download merged GGUF |
| GET | `/jobs` | List all jobs |
| DELETE | `/job/{job_id}` | Delete job + files |

## Deploy to Akash

```bash
# Build images
docker build -t ghcr.io/toxmon/forge-trainer:<sha> ./trainer/
docker push ghcr.io/toxmon/forge-trainer:<sha>

# Update SHA in sdl/deploy.yaml (replace SHA_PLACEHOLDER)

# Deploy
akash deployment create sdl/deploy.yaml
akash lease list
akash provider send-manifest sdl/deploy.yaml <lease-id>
```

## Why Akash?

| Akash Advantage | Forge Application |
|----------------|------------------|
| $0.0003/hr GPU | Training costs less than a rounding error |
| No content policy | Train on medical data, security research, political writing |
| SDL standard | One YAML = reproducible, auditable training environment |
| Ephemeral deploy | Spin up GPU for 30 min, spin down, pay only for usage |
| Permissionless | No account approval, no API keys, no IAM roles |

## License

MIT
