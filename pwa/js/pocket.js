/* Forge PWA — Pocket View (wllama local inference) */
import { Wllama } from 'wllama';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/wllama@1.16.1/esm';

const PocketView = {
  wllama: null,
  personaId: null,
  personaName: '',
  messages: [],
  generating: false,
  startTime: 0,
  tokenCount: 0,

  async loadPersona(id) {
    if (this.generating) return;
    this.personaId = id;
    ForgeApp.activePersonaId = id;
    const p = await ForgeDB.getPersona(id);
    if (!p) { alert('Persona not found.'); return; }
    this.personaName = p.name;
    this.messages = await ForgeDB.getMessages(id);
    this.showChatUI();
    this.renderMessages();
    if (this.wllama) {
      this.setModelStatus('success');
      document.getElementById('personaName').textContent = p.name + ' (loaded)';
      return;
    }
    this.setModelStatus('warning');
    document.getElementById('personaName').textContent = p.name + ' (loading...)';
    ForgeApp.showLoading('Loading model into WASM...');
    try {
      this.wllama = new Wllama({
        'single-thread/wllama.wasm': `${WASM_BASE}/single-thread/wllama.wasm`,
        'multi-thread/wllama.wasm': `${WASM_BASE}/multi-thread/wllama.wasm`,
        'multi-thread/wllama.worker.mjs': `${WASM_BASE}/multi-thread/wllama.worker.mjs`,
      }, {
        allowOffload: false,
      });
      await this.wllama.loadModelFromBlob(p.gguf_blob);
      ForgeApp.hideLoading();
      this.setModelStatus('success');
      document.getElementById('personaName').textContent = p.name;
    } catch (err) {
      ForgeApp.hideLoading();
      this.setModelStatus('error');
      document.getElementById('personaName').textContent = p.name + ' (error)';
      console.error('Model load failed:', err);
      alert('Failed to load model: ' + err.message);
    }
  },

  unload() {
    this.personaId = null;
    this.personaName = '';
    this.messages = [];
    if (this.wllama) { try { this.wllama.unload(); } catch {} this.wllama = null; }
    this.hideChatUI();
  },

  setModelStatus(state) {
    const dot = document.getElementById('modelStatus');
    dot.className = 'status-dot ' + state;
  },

  showChatUI() {
    document.getElementById('personaBar').style.display = 'flex';
    document.getElementById('welcomeMsg').style.display = 'none';
    document.getElementById('chatInputArea').style.display = 'flex';
    document.getElementById('chatStats').style.display = 'flex';
  },

  hideChatUI() {
    document.getElementById('personaBar').style.display = 'none';
    document.getElementById('welcomeMsg').style.display = 'block';
    document.getElementById('chatInputArea').style.display = 'none';
    document.getElementById('chatStats').style.display = 'none';
  },

  renderMessages() {
    const c = document.getElementById('chatContainer');
    const msgs = this.messages.map((m) =>
      `<div class="chat-msg ${m.role}"><div class="chat-bubble">${this.esc(m.content)}</div></div>`
    ).join('');
    c.innerHTML = msgs;
    c.scrollTop = c.scrollHeight;
    document.getElementById('msgCount').textContent = this.messages.length;
  },

  esc(s) {
    const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
  },

  buildPrompt() {
    let prompt = '';
    for (const m of this.messages) {
      const tag = m.role === 'user' ? 'user' : 'assistant';
      prompt += `<|im_start|>${tag}\n${m.content}<|im_end|>\n`;
    }
    prompt += '<|im_start|>assistant\n';
    return prompt;
  },

  async sendMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || this.generating) return;
    if (!this.wllama) { alert('Model not loaded yet.'); return; }
    input.value = '';
    input.style.height = '40px';
    const userMsg = { id: ForgeDB.uuid(), persona_id: this.personaId, role: 'user', content: text, timestamp: new Date().toISOString() };
    this.messages.push(userMsg);
    await ForgeDB.saveMessage(userMsg);
    this.appendBubble('user', text);
    const bubble = this.appendBubble('assistant', '');
    bubble.classList.add('typing');
    this.generating = true;
    document.getElementById('sendBtn').disabled = true;
    this.startTime = performance.now();
    this.tokenCount = 0;
    let reply = '';
    try {
      const prompt = this.buildPrompt();
      await this.wllama.createCompletion(prompt, {
        nPredict: 2048,
        onNewToken: (tok) => {
          reply += tok;
          this.tokenCount++;
          bubble.textContent = reply;
          bubble.classList.remove('typing');
          const c = document.getElementById('chatContainer');
          c.scrollTop = c.scrollHeight;
          const elapsed = (performance.now() - this.startTime) / 1000;
          const speed = (this.tokenCount / elapsed).toFixed(1);
          document.getElementById('tokSpeed').textContent = speed + ' t/s';
        },
      });
    } catch (err) {
      reply = '[Error: ' + err.message + ']';
      bubble.textContent = reply;
      bubble.classList.remove('typing');
    }
    const asstMsg = { id: ForgeDB.uuid(), persona_id: this.personaId, role: 'assistant', content: reply, timestamp: new Date().toISOString() };
    this.messages.push(asstMsg);
    await ForgeDB.saveMessage(asstMsg);
    this.generating = false;
    document.getElementById('sendBtn').disabled = false;
    document.getElementById('msgCount').textContent = this.messages.length;
  },

  appendBubble(role, text) {
    const c = document.getElementById('chatContainer');
    const div = document.createElement('div');
    div.className = `chat-msg ${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    div.appendChild(bubble);
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
    return bubble;
  },
};

window.PocketView = PocketView;

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); PocketView.sendMessage(); }
  });
  input.addEventListener('input', () => {
    input.style.height = '40px';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  sendBtn.addEventListener('click', () => PocketView.sendMessage());
});
