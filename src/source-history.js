import { digest } from './backup-v2.js';
export const HISTORY_LIMIT = 12;
export const HISTORY_BYTES = 80 * 1024 * 1024;
const DB = 'athena-source-history-v1';

export function historyEvictions(records) {
  let bytes = 0;
  return [...records].sort((a,b) => b.used - a.used || a.id.localeCompare(b.id))
    .filter((r,i) => { bytes += r.size; return i >= HISTORY_LIMIT || bytes > HISTORY_BYTES; })
    .map(r => r.id);
}

async function transaction(mode, action) {
  const db = await new Promise((resolve,reject) => {
    const request = indexedDB.open(DB,1);
    request.onupgradeneeded = () => request.result.createObjectStore('sources',{keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve,reject) => {
      const tx = db.transaction('sources',mode);
      let result;
      action(tx.objectStore('sources'), value => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || Error('素材保存中断'));
    });
  } finally { db.close(); }
}

export function listSources() {
  return transaction('readonly',(store,done) => {
    store.getAll().onsuccess = event => done(event.target.result.sort((a,b)=>b.used-a.used));
  });
}
export function getSource(id) {
  return transaction('readonly',(store,done) => { store.get(id).onsuccess = e => done(e.target.result); });
}
export function removeSource(id) { return transaction('readwrite',store=>store.delete(id)); }

export async function saveSource(file, thumbnail, settings) {
  const id = await digest(await file.arrayBuffer());
  const record = { id, name:file.name, blob:file, thumbnail, size:file.size+(thumbnail?.size || 0), used:Date.now(), settings };
  await transaction('readwrite',store => {
    store.put(record);
    store.getAll().onsuccess = event => {
      for (const expired of historyEvictions(event.target.result)) store.delete(expired);
    };
  });
  return record;
}
export function saveSourceSettings(id,settings) {
  return transaction('readwrite',store => {
    store.get(id).onsuccess = event => {
      const record = event.target.result;
      if (record) store.put({...record,settings});
    };
  });
}
