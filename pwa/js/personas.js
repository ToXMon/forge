/* Forge PWA — Personas View */
const ForgePersonas = {
  async render() {
    const list = document.getElementById('personasList');
    const empty = document.getElementById('personasEmpty');
    const personas = await ForgeDB.listPersonas();
    if (personas.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = personas.map((p) => `
      <div class="persona-card" data-id="${p.id}">
        <div class="persona-meta">
          <h4>${this.esc(p.name)}</h4>
          <p>${p.size_mb} MB · ${p.base_model} · ${p.quantization}</p>
          <p>${this.formatDate(p.created_at)}</p>
        </div>
        <div class="persona-actions">
          <button class="btn-load" data-action="load" data-id="${p.id}">Load</button>
          <button class="btn-rename" data-action="rename" data-id="${p.id}">✏️</button>
          <button class="btn-danger" data-action="delete" data-id="${p.id}">🗑️</button>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'load') this.loadPersona(id);
        else if (action === 'rename') this.startRename(id);
        else if (action === 'delete') this.deletePersona(id);
      });
    });
  },

  esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  },

  formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  async loadPersona(id) {
    ForgeApp.activePersonaId = id;
    ForgeApp.showView('pocketView');
    if (typeof PocketView !== 'undefined') PocketView.loadPersona(id);
  },

  async startRename(id) {
    const p = await ForgeDB.getPersona(id);
    if (!p) return;
    const card = document.querySelector(`.persona-card[data-id="${id}"] h4`);
    if (!card) return;
    const input = document.createElement('input');
    input.className = 'form-input';
    input.value = p.name;
    input.style.marginBottom = '4px';
    card.replaceWith(input);
    input.focus();
    input.select();
    const finish = async () => {
      const newName = input.value.trim();
      if (newName && newName !== p.name) {
        await ForgeDB.renamePersona(id, newName);
      }
      this.render();
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
      if (e.key === 'Escape') { input.value = p.name; input.blur(); }
    });
  },

  async deletePersona(id) {
    const p = await ForgeDB.getPersona(id);
    if (!p) return;
    const ok = await ForgeApp.confirm(`Delete "${p.name}"? This cannot be undone.`);
    if (!ok) return;
    await ForgeDB.deletePersona(id);
    if (ForgeApp.activePersonaId === id) {
      ForgeApp.activePersonaId = null;
      if (typeof PocketView !== 'undefined') PocketView.unload();
    }
    window.dispatchEvent(new Event('personas:updated'));
    this.render();
  },
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('goForge').addEventListener('click', () => {
    ForgeApp.showView('forgeView');
  });
});
