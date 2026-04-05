/* Forge PWA — IndexedDB Wrapper */
const DB_NAME = 'forge-db';
const DB_VERSION = 1;
let db = null;

function openDB() {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('personas')) {
        const ps = d.createObjectStore('personas', { keyPath: 'id' });
        ps.createIndex('name', 'name', { unique: false });
      }
      if (!d.objectStoreNames.contains('messages')) {
        const ms = d.createObjectStore('messages', { keyPath: 'id' });
        ms.createIndex('persona_id', 'persona_id', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

function tx(store, mode) {
  return openDB().then((d) => {
    const t = d.transaction(store, mode);
    return t.objectStore(store);
  });
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const ForgeDB = {
  async savePersona(p) {
    const s = await tx('personas', 'readwrite');
    return promisify(s.put(p));
  },

  async getPersona(id) {
    const s = await tx('personas', 'readonly');
    return promisify(s.get(id));
  },

  async listPersonas() {
    const s = await tx('personas', 'readonly');
    const all = await promisify(s.getAll());
    return all.map((p) => ({
      id: p.id, name: p.name, size_mb: p.size_mb,
      base_model: p.base_model, quantization: p.quantization,
      created_at: p.created_at, job_id: p.job_id,
    }));
  },

  async deletePersona(id) {
    const s = await tx('personas', 'readwrite');
    await promisify(s.delete(id));
    const ms = await tx('messages', 'readwrite');
    const idx = ms.index('persona_id');
    const keys = await promisify(idx.getAllKeys(id));
    for (const k of keys) await promisify(ms.delete(k));
  },

  async renamePersona(id, newName) {
    const p = await this.getPersona(id);
    if (!p) return;
    p.name = newName;
    const s = await tx('personas', 'readwrite');
    return promisify(s.put(p));
  },

  async saveMessage(m) {
    const s = await tx('messages', 'readwrite');
    return promisify(s.put(m));
  },

  async getMessages(personaId) {
    const s = await tx('messages', 'readonly');
    const idx = s.index('persona_id');
    const all = await promisify(idx.getAll(personaId));
    return all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  },

  async clearMessages(personaId) {
    const s = await tx('messages', 'readwrite');
    const idx = s.index('persona_id');
    const keys = await promisify(idx.getAllKeys(personaId));
    for (const k of keys) await promisify(s.delete(k));
  },

  uuid() {
    return crypto.randomUUID ? crypto.randomUUID() :
      'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
  },
};
