/* Forge PWA — Forge View Logic */
const ForgeView = {
  jobId: null,
 pollTimer: null,
 jsonlData: null,

  init() {
    this.bindFileDrop();
    this.bindForge();
    this.bindDownload();
  },

  bindFileDrop() {
    const drop = document.getElementById('fileDrop');
    const input = document.getElementById('fileInput');
    const nameEl = document.getElementById('fileName');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
      if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', () => {
      if (input.files[0]) this.handleFile(input.files[0]);
    });
  },

  handleFile(file) {
    if (!file.name.endsWith('.jsonl')) return;
    document.getElementById('fileName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => { this.jsonlData = e.target.result; };
    reader.readAsText(file);
  },

  getJsonl() {
    if (this.jsonlData) return this.jsonlData;
    const paste = document.getElementById('jsonlPaste').value.trim();
    if (paste) return paste;
    return null;
  },

  bindForge() {
    document.getElementById('forgeBtn').addEventListener('click', () => this.startTraining());
  },

  async startTraining() {
    const jsonl = this.getJsonl();
    if (!jsonl) { alert('Upload or paste JSONL training data.'); return; }
    const name = document.getElementById('adapterName').value.trim();
    if (!name) { alert('Enter an adapter name.'); return; }
    const url = document.getElementById('trainerUrl').value.trim();
    if (!url) {
      alert('No trainer endpoint configured. Deploy the Forge trainer on Akash first.');
      return;
    }
    const body = {
      adapter_name: name, data: jsonl, data_format: 'jsonl',
      lora_r: parseInt(document.getElementById('loraR').value),
      lora_alpha: parseInt(document.getElementById('loraAlpha').value),
      num_epochs: parseInt(document.getElementById('epochs').value),
      learning_rate: parseFloat(document.getElementById('lr').value),
    };
    document.getElementById('forgeBtn').disabled = true;
    document.getElementById('forgeBtn').textContent = 'Starting...';
    try {
      const res = await fetch(`${url}/train`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.jobId = data.job_id;
      document.getElementById('progressSection').style.display = 'block';
      this.startPolling(url);
    } catch (err) {
      alert('Failed to start training: ' + err.message);
      document.getElementById('forgeBtn').disabled = false;
      document.getElementById('forgeBtn').textContent = '🔨 Forge Adapter';
    }
  },

  startPolling(url) {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => this.pollStatus(url), 5000);
    this.pollStatus(url);
  },

  async pollStatus(url) {
    try {
      const res = await fetch(`${url}/status/${this.jobId}`);
      if (!res.ok) return;
      const s = await res.json();
      const pct = Math.round(s.progress * 100);
      document.getElementById('progressFill').style.width = `${pct}%`;
      document.getElementById('epochInfo').textContent = `${s.current_epoch || 0}/${s.total_epochs || 3}`;
      document.getElementById('lossInfo').textContent = s.train_loss ? s.train_loss.toFixed(3) : '-';
      if (s.status === 'complete') {
        clearInterval(this.pollTimer);
        document.getElementById('downloadBtn').style.display = 'block';
        document.getElementById('forgeBtn').textContent = '✅ Complete';
      } else if (s.status === 'failed') {
        clearInterval(this.pollTimer);
        alert('Training failed.');
        document.getElementById('forgeBtn').disabled = false;
        document.getElementById('forgeBtn').textContent = '🔨 Forge Adapter';
      }
    } catch { /* retry on next poll */ }
  },

  bindDownload() {
    document.getElementById('downloadBtn').addEventListener('click', () => this.downloadGGUF());
  },

  async downloadGGUF() {
    const url = document.getElementById('trainerUrl').value.trim();
    ForgeApp.showLoading('Downloading merged GGUF (~4.3GB)...');
    try {
      const res = await fetch(`${url}/download/${this.jobId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = document.getElementById('adapterName').value.trim();
      const persona = {
        id: ForgeDB.uuid(), name: name, gguf_blob: blob,
        size_mb: Math.round(blob.size / (1024 * 1024)),
        base_model: 'Qwen2.5-7B-Instruct', quantization: 'Q4_K_M',
        created_at: new Date().toISOString(), job_id: this.jobId,
      };
      await ForgeDB.savePersona(persona);
      ForgeApp.hideLoading();
      window.dispatchEvent(new Event('personas:updated'));
      ForgeApp.activePersonaId = persona.id;
      ForgeApp.showView('pocketView');
      if (typeof PocketView !== 'undefined') PocketView.loadPersona(persona.id);
    } catch (err) {
      ForgeApp.hideLoading();
      alert('Download failed: ' + err.message);
    }
  },
};

document.addEventListener('DOMContentLoaded', () => ForgeView.init());
