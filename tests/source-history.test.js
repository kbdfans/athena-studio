import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSource, getSource, listSources, removeSource, saveSourceSettings, historyEvictions, HISTORY_BYTES } from '../src/source-history.js';

test('history persists original bytes and editing settings, deduplicates and removes records', async () => {
  const file = new File([new Uint8Array([71,73,70,56,57,97])],'cat.gif',{type:'image/gif'});
  const thumb = new Blob(['preview'],{type:'image/png'});
  const first = await saveSource(file,thumb,{zoom:1.5,fps:12});
  const persisted = await getSource(first.id);
  assert.deepEqual(new Uint8Array(await persisted.blob.arrayBuffer()),new Uint8Array(await file.arrayBuffer()));
  assert.equal(persisted.name,'cat.gif');
  assert.equal(persisted.settings.fps,12);
  await saveSourceSettings(first.id,{zoom:2,start:2,end:8,fps:10});
  assert.equal((await getSource(first.id)).settings.zoom,2);
  const again=await saveSource(file,thumb,{zoom:2});
  assert.equal(again.id,first.id); assert.equal((await listSources()).length,1);
  await removeSource(first.id);
  await saveSourceSettings(first.id,{zoom:3});
  assert.equal(await getSource(first.id),undefined,'delayed edits cannot resurrect removed records');
});

test('history retention removes least recently used records at count and byte limits', () => {
  const records=Array.from({length:14},(_,i)=>({id:String(i),used:i,size:100}));
  assert.deepEqual(historyEvictions(records),['1','0']);
  assert.deepEqual(historyEvictions([{id:'recent',used:3,size:HISTORY_BYTES/2},{id:'middle',used:2,size:HISTORY_BYTES/2},{id:'old',used:1,size:1}]),['old']);
});
