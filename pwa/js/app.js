/* Forge PWA — App Shell & Router */
const ForgeApp = {
  currentView: 'forgeView',
  activePersonaId: null,

  init() {
    this.registerSW();
    this.bindNav();
    this.bindInstall();
    this.showView('forgeView');
    window.addEventListener('personas:updated', () => {
      if (typeof ForgePersonas !== 'undefined') ForgePersonas.render();
    });
  },

  showView(viewId) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.view === viewId);
    });
    this.currentView = viewId;
    if (viewId === 'personasView' && typeof ForgePersonas !== 'undefined') {
      ForgePersonas.render();
    }
  },

  bindNav() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => this.showView(btn.dataset.view));
    });
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  },

  bindInstall() {
    let deferred = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      document.getElementById('installBtn').style.display = 'block';
    });
    document.getElementById('installBtn').addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      document.getElementById('installBtn').style.display = 'none';
    });
  },

  showLoading(msg) {
    let el = document.getElementById('loadingOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loadingOverlay';
      el.className = 'loading-overlay';
      el.innerHTML = '<div class="spinner"></div><span></span>';
      document.body.appendChild(el);
    }
    el.querySelector('span').textContent = msg || 'Loading...';
    el.style.display = 'flex';
  },

  hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
  },

  confirm(msg) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML = `
        <div class="confirm-box">
          <p>${msg}</p>
          <div class="btn-row">
            <button class="btn-cancel">Cancel</button>
            <button class="btn-confirm-del">Delete</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('.btn-cancel').onclick = () => {
        overlay.remove(); resolve(false);
      };
      overlay.querySelector('.btn-confirm-del').onclick = () => {
        overlay.remove(); resolve(true);
      };
    });
  },
};

document.addEventListener('DOMContentLoaded', () => ForgeApp.init());
