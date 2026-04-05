# AGENTS.md — Forge

## Project Overview
Forge: Decentralized LoRA forge for sovereign mobile AI.
Train personal LoRA adapters on Akash GPU, download merged GGUF to phone, run personalized AI 100% locally.

## Architecture
3-layer system:
- **Forge** (trainer): FastAPI service on Akash GPU, trains LoRA + merges to GGUF
- **Anvil** (validator): LlamaEdge instance for A/B testing (Phase 2)
- **Pocket** (PWA): wllama WASM runtime for local inference on mobile

---

## Trainer Service API Spec

### POST /train
Start a new LoRA training job.

**Request:**
```json
{
  "adapter_name": "work-tolu",
  "data": "[JSONL string or base64]",
  "data_format": "jsonl",
  "lora_r": 64,
  "lora_alpha": 64,
  "num_epochs": 3,
  "learning_rate": 0.0001
}
```

**Response (202):**
```json
{
  "job_id": "uuid-string",
  "status": "queued",
  "adapter_name": "work-tolu",
  "estimated_time_minutes": 30
}
```

### GET /status/{job_id}
Get training job status.

**Response:**
```json
{
  "job_id": "uuid-string",
  "status": "training|merging|complete|failed",
  "progress": 0.65,
  "current_epoch": 2,
  "total_epochs": 3,
  "train_loss": 0.823,
  "elapsed_seconds": 1200,
  "estimated_remaining_seconds": 600,
  "cost_uakt": 150
}
```

### GET /download/{job_id}
Download merged GGUF file.

**Response:** Binary stream, Content-Type: application/octet-stream
Headers: Content-Length, Content-Disposition: attachment; filename="work-tolu-merged-Q4_K_M.gguf"

### GET /jobs
List all jobs.

**Response:**
```json
{
  "jobs": [
    {
      "job_id": "uuid",
      "adapter_name": "work-tolu",
      "status": "complete",
      "created_at": "ISO8601",
      "merged_gguf_size_mb": 4300,
      "final_loss": 0.72
    }
  ]
}
```

### DELETE /job/{job_id}
Delete a job and its files.

---

## Trainer Internal Pipeline

1. **Receive JSONL** → validate format (messages array with user/assistant roles)
2. **Load model** → unsloth/Qwen2.5-7B-Instruct-bnb-4bit
3. **Add LoRA** → r=64, alpha=64, targets=[q_proj,k_proj,v_proj,o_proj]
4. **Format dataset** → apply Qwen chat template
5. **Train** → SFTTrainer, 3 epochs, lr=1e-4, cosine scheduler
6. **Merge** → model.merge_and_save() to merge LoRA into base weights
7. **Export GGUF** → Unsloth save_pretrained_gguf() with Q4_K_M quantization
8. **Serve** → merged GGUF available at /download/{job_id}

**CRITICAL:** Step 6-7 must happen server-side. wllama cannot load LoRA adapters at runtime.

---

## PWA Spec

### Tech Stack
- Vanilla HTML/CSS/JS (no framework)
- wllama from CDN: `https://cdn.jsdelivr.net/npm/@anthropic-ai/wllama@latest/dist/wllama.esm.js`
- IndexedDB via idb-keyval for persona storage
- Service Worker for offline install

### PWA Views
1. **Forge** — Upload data, configure, trigger training, see progress
2. **Pocket** — Load persona, chat locally, offline indicator
3. **Personas** — Manage downloaded GGUF files, rename, delete

### PWA Data Schemas

**Persona (IndexedDB):**
```json
{
  "id": "uuid",
  "name": "Work Tolu",
  "gguf_blob": "Blob",
  "size_mb": 4300,
  "base_model": "Qwen2.5-7B-Instruct",
  "quantization": "Q4_K_M",
  "created_at": "ISO8601",
  "job_id": "from-trainer"
}
```

**Chat Message (IndexedDB):**
```json
{
  "id": "uuid",
  "persona_id": "uuid",
  "role": "user|assistant",
  "content": "text",
  "timestamp": "ISO8601"
}
```

### wllama Integration
```javascript
import { Wllama } from '@anthropic-ai/wllama/esm';

const wllama = new Wllama({
  'single-thread/wllama.wasm': '/wasm/single-thread/wllama.wasm',
  'multi-thread/wllama.wasm': '/wasm/multi-thread/wllama.wasm',
  'multi-thread/wllama.worker.mjs': '/wasm/multi-thread/wllama.worker.mjs',
});

await wllama.loadModelFromBlob(ggufBlob);
const reply = await wllama.createCompletion(prompt, { nPredict: 2048 });
```

---

## Design System

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| bg-primary | #0a0a0a | Main background |
| bg-secondary | #111111 | Cards, panels |
| bg-tertiary | #1a1a1a | Borders, dividers |
| text-primary | #f5f5f5 | Headings, body |
| text-secondary | #a3a3a3 | Muted text |
| accent | #f97316 | Buttons, highlights, forge brand |
| accent-hover | #ea580c | Button hover |
| success | #22c55e | Training complete, online |
| error | #ef4444 | Training failed, offline |
| warning | #eab308 | In progress |

### Typography
- Font: system-ui, -apple-system, sans-serif
- Mono: 'JetBrains Mono', 'Fira Code', monospace (for costs, technical data)
- Headings: 600 weight, text-primary
- Body: 400 weight, text-primary
- Muted: 400 weight, text-secondary

### Components
- Buttons: rounded-lg, px-4 py-2, accent bg for primary, bg-secondary for secondary
- Cards: bg-secondary, border border-tertiary, rounded-xl, p-4
- Input: bg-primary, border border-tertiary, rounded-lg, text-primary, focus:border-accent
- Status dots: 8px circle, success/error/warning colors

---

## Deployment Config

### Akash SDL (Phase 1 — Frontend + Trainer only)
- forge-frontend: CPU 0.5 units, 512Mi RAM, 1Gi storage, port 3000→80
- forge-trainer: GPU RTX 4090, CPU 2 units, 16Gi RAM, 20Gi storage, port 5000 (internal)
- denom: uakt
- NO :latest tags — use git SHA

### Docker Images
- ghcr.io/toxmon/forge-frontend:{sha}
- ghcr.io/toxmon/forge-trainer:{sha}

---

## File Structure
```
forge/
├── HARNESS.md
├── AGENTS.md
├── trainer/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app.py              # FastAPI main
│   ├── train_pipeline.py   # LoRA train + merge + GGUF export
│   ├── job_manager.py      # Job queue, status tracking
│   └── config.py           # Defaults, constants
├── pwa/
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   │   └── app.css         # Full design system
│   ├── js/
│   │   ├── app.js          # Router, view switching
│   │   ├── forge.js        # Data upload, training trigger
│   │   ├── pocket.js       # wllama integration, chat
│   │   ├── personas.js     # IndexedDB persona management
│   │   └── db.js           # IndexedDB wrapper
│   └── public/
│       └── icons/
├── sdl/
│   └── deploy.yaml         # Akash SDL
└── README.md
```

---

## Cost Reference (for UI display)
| Provider | Per Session | Monthly (100 trains) |
|----------|-------------|---------------------|
| AWS H100 | $2.45 | $735 |
| RunPod A6000 | $0.37 | $111 |
| **Forge (Akash)** | **$0.00015** | **$0.015** |
