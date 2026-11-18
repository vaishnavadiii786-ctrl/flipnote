// FLIPNOTE Local Database — IndexedDB storage for notes, study sets, quizzes, revision, sessions, settings

const DB_NAME = 'flipnote_db';
const DB_VERSION = 1;

const STORES = [
  'notes',
  'studySets',
  'quizzes',
  'quizHistory',
  'revisionLogs',
  'sessions',
  'settings'
];

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const keyPath = name === 'settings' ? 'key' : 'id';
          db.createObjectStore(name, { keyPath });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function withStore(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putItem(storeName, item) {
  return withStore(storeName, 'readwrite', (store) => store.put(item));
}

export async function getItem(storeName, key) {
  return withStore(storeName, 'readonly', (store) => store.get(key));
}

export async function getAllItems(storeName) {
  const items = await withStore(storeName, 'readonly', (store) => store.getAll());
  return (items || []).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
}

export async function deleteItem(storeName, key) {
  return withStore(storeName, 'readwrite', (store) => store.delete(key));
}

export async function getSetting(key, defaultValue = null) {
  const rec = await getItem('settings', key);
  return rec ? rec.value : defaultValue;
}

export async function setSetting(key, value) {
  return putItem('settings', { key, value, updatedAt: Date.now() });
}

export async function getAllSettings() {
  const rows = await withStore('settings', 'readonly', (store) => store.getAll());
  const out = {};
  for (const r of rows || []) out[r.key] = r.value;
  return out;
}

export async function exportAllData() {
  const payload = {
    app: 'FLIPNOTE',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {}
  };
  for (const name of STORES) {
    payload.data[name] = await withStore(name, 'readonly', (store) => store.getAll());
  }
  return payload;
}

export async function importAllData(payload) {
  if (!payload || payload.app !== 'FLIPNOTE' || !payload.data) {
    throw new Error('Invalid FLIPNOTE backup format');
  }
  const db = await openDB();
  for (const name of STORES) {
    const rows = Array.isArray(payload.data[name]) ? payload.data[name] : [];
    await new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      const store = tx.objectStore(name);
      for (const row of rows) {
        store.put(row);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export async function clearAllData() {
  const db = await openDB();
  for (const name of STORES) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      tx.objectStore(name).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
