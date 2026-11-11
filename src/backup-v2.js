const DB = "athena-screen-studio-backups-layout2";
export async function digest(data) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function database() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("backups", { keyPath: "id" });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function transaction(mode, action) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction("backups", mode);
      const r = action(t.objectStore("backups"));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || Error("备份事务中断"));
    });
  } finally {
    db.close();
  }
}
export async function saveBackup(slot, data, model="athena75") {
  const record = {
    id: crypto.randomUUID(),
    slot,
    model,
    data,
    sha256: await digest(data),
    created: new Date().toISOString(),
  };
  await transaction("readwrite", (s) => s.put(record));
  const saved = await getBackup(record.id);
  if (
    !saved ||
    saved.sha256 !== record.sha256 ||
    (await digest(saved.data)) !== record.sha256
  )
    throw Error("备份保存校验失败，未开始写入");
  return record;
}
export function getBackup(id) {
  return transaction("readonly", (s) => s.get(id));
}
export async function listBackups(model="athena75") {
  return (await transaction("readonly", (s) => s.getAll())).filter(r=>(r.model||"athena75")===model).sort((a, b) =>
    b.created.localeCompare(a.created),
  );
}
