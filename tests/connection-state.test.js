import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLiveConnection, renderConnectionControls } from '../src/connection-state.js';

test('all three connection controls follow the same runtime through busy, unplug and reconnect', () => {
  const element = () => ({ textContent: '', hidden:false, disabled:false, classList:{toggle(){}} });
  const controls = [element(), element(), element()], connected = [element()], disconnected = [element()];
  const ids = Object.fromEntries(['connection-title','identify','connection-disconnect'].map(id=>[id,element()]));
  const root = {
    querySelectorAll(s) { return s === '#connect, [data-modal-connect]' ? controls : s === '[data-connected-only]' ? connected : disconnected; },
    getElementById: id => ids[id],
  };
  let calls = 0;
  const runtime = { profile:{name:'Athena75'}, device:{opened:true, close(){calls++;}}, broken:false, close(){calls++;} };
  for (let i=0;i<3;i++) renderConnectionControls(runtime,false,root);
  assert.ok(controls.every(b=>b.textContent==='已连接 · Athena75' && !b.disabled));
  assert.equal(ids.identify.disabled,true);
  assert.equal(connected[0].hidden,false); assert.equal(disconnected[0].hidden,true);
  assert.equal(calls,0,'refreshing views never closes the shared device');
  renderConnectionControls(runtime,true,root); assert.ok(controls.every(b=>b.disabled));
  assert.equal(ids['connection-disconnect'].disabled,true);
  runtime.device.opened=false; renderConnectionControls(runtime,false,root);
  assert.ok(controls.every(b=>b.textContent==='连接键盘 ↗'));
  assert.equal(connected[0].hidden,true); assert.equal(ids.identify.disabled,false);
  runtime.device.opened=true; renderConnectionControls(runtime,false,root);
  assert.ok(controls.every(b=>b.textContent==='已连接 · Athena75'));
  runtime.broken=true; renderConnectionControls(runtime,false,root);
  assert.ok(controls.every(b=>b.textContent==='连接键盘 ↗'));
});

test('only an open, healthy device is a reusable session', () => {
  assert.equal(hasLiveConnection(null),false);
  assert.equal(hasLiveConnection({device:{opened:false}}),false);
  assert.equal(hasLiveConnection({device:{opened:true},broken:true}),false);
  assert.equal(hasLiveConnection({device:{opened:true}}),true);
});


test('connection header uses the identified model, never a fixed Athena75 label',()=>{
 const button={textContent:'',classList:{toggle(){}},disabled:false};
 const ids=Object.fromEntries(['connection-title','identify','connection-disconnect'].map(id=>[id,{}]));
 const root={querySelectorAll:s=>s==='#connect, [data-modal-connect]'?[button]:[],getElementById:id=>ids[id]};
 renderConnectionControls({profile:{name:'Athena1800'},device:{opened:true}},false,root);
 assert.equal(button.textContent,'已连接 · Athena1800');assert.equal(ids['connection-title'].textContent,'已连接 · Athena1800');
});
