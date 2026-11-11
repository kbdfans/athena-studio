import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {saveBackup,listBackups,getBackup} from '../src/backup-v2.js';
test('screen backups are model scoped;75 defaults remain compatible',async()=>{
 const a=await saveBackup(0,new Uint8Array([1,2,3]));const b=await saveBackup(0,new Uint8Array([4,5,6]),'athena1800');
 assert.equal((await getBackup(b.id)).model,'athena1800');
 assert((await listBackups()).some(r=>r.id===a.id));assert(!(await listBackups()).some(r=>r.id===b.id));
 assert.deepEqual((await listBackups('athena1800')).map(r=>r.id),[b.id]);
});
