import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeBuildInfo,firmwareVersionStatus} from '../src/firmware-compatibility.js';
function info(pid=0x2513){const p=new Uint8Array(32);p.set(new TextEncoder().encode('ASF1'),6);new DataView(p.buffer).setUint16(10,pid,true);p.set([1,16,1,2],12);new DataView(p.buffer).setUint32(16,2026111101,true);p.set(new TextEncoder().encode('75-261111-1'),20);return p;}
test('build identity is model-specific and preserves schema and release ordering',()=>{
 const p=info(),d=decodeBuildInfo(p),release={model:'athena75',hardwareRevision:'original-rp2040-16mb',buildId:'75-261111-1',releaseSequence:2026111101};
 assert.equal(d.model,'athena75');assert.equal(d.configSchema,1);assert.equal(d.resourceSchema,2);assert.equal(d.buildId,release.buildId);assert.equal(firmwareVersionStatus(d,release).kind,'current');
 assert.equal(firmwareVersionStatus(null,release).kind,'unknown');assert.equal(firmwareVersionStatus({...d,model:'athena1800'},release).kind,'unsupported');assert.equal(firmwareVersionStatus({...d,buildId:'other',releaseSequence:2026111102},release).kind,'newer');assert.equal(firmwareVersionStatus({...d,buildId:'older',releaseSequence:1},release).kind,'update');
 assert.equal(decodeBuildInfo(info(0x4100)).model,'athena1800');p[13]=8;assert.equal(decodeBuildInfo(p),null);assert.equal(decodeBuildInfo(new Uint8Array(32)),null);
});
