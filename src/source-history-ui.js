import { listSources, getSource, removeSource } from './source-history.js';

export function setupSourceHistory({ load, getBusy, notice }) {
  const list = document.getElementById('source-history-list');
  const status = document.getElementById('source-history-status');
  let urls = [], generation = 0;
  const report = () => { status.textContent = '浏览器暂时无法保存素材记录，当前画布仍可继续使用。'; };
  async function refresh() {
    const token = ++generation;
    try {
      const records = await listSources();
      if (token !== generation) return;
      urls.forEach(URL.revokeObjectURL); urls = [];
      list.replaceChildren();
      document.getElementById('source-history-count').textContent = `${records.length} / 12`;
      status.textContent = records.length ? '点击素材继续编辑；记录仅在此浏览器中保存，清除网站数据会移除记录。' : '导入 GIF 或图片后，会自动保存在这里。清除网站数据会移除记录。';
      for (const record of records) {
        const card = document.createElement('div'); card.className = 'source-history-card';
        const use = document.createElement('button'); use.className = 'source-history-use';
        use.dataset.i18nSkip = ''; use.title = record.name; use.setAttribute('aria-label',`加载素材 ${record.name}`);
        const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy';
        if (record.thumbnail) { image.src = URL.createObjectURL(record.thumbnail); urls.push(image.src); }
        const name = document.createElement('strong'); name.textContent = record.name;
        const meta = document.createElement('span'); meta.textContent = `${record.blob.size < 1048576 ? Math.max(1,Math.ceil(record.blob.size/1024))+" KB" : (record.blob.size/1048576).toFixed(1)+" MB"} · ${new Date(record.used).toLocaleDateString()}`;
        use.append(image,name,meta);
        use.onclick = async () => {
          if (getBusy()) return;
          try {
            const saved = await getSource(record.id);
            if (!saved) { await refresh(); return; }
            await load(new File([saved.blob],saved.name,{type:saved.blob.type}),saved.settings);
          } catch (error) { notice(`素材加载失败：${error.message}`,true); }
        };
        const remove = document.createElement('button'); remove.className = 'source-history-remove'; remove.textContent = '×'; remove.setAttribute('aria-label',`移除素材记录 ${record.name}`);
        remove.onclick = async () => {
          if (getBusy()) return;
          try { await removeSource(record.id); await refresh(); }
          catch { report(); }
        };
        card.append(use,remove); list.append(card);
      }
    } catch { if (token === generation) report(); }
  }
  return { refresh, report };
}
