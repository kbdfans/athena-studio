import test from 'node:test';import assert from 'node:assert/strict';
import {CONNECTION_MODELS,connectionModel,readConnectionModel,rememberConnectionModel,rememberSerialPort,chooseSerialPort} from '../src/connection-models.js';
const store=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)}};
const port=(vid=0x9d5b,pid=9824)=>({getInfo:()=>({usbVendorId:vid,usbProductId:pid})});
test('keyboard names route internally and invalid stored choices do not select a transport',()=>{
 assert.equal(connectionModel('athena1800').protocol,'qmk');assert.equal(connectionModel('agar-micro').protocol,'zmk');assert.equal(connectionModel('tofu60-ble').name,'Tofu60 BLE 3.0');assert(CONNECTION_MODELS.every(m=>!/(QMK|ZMK)/.test(m.name)));
 const s=store();rememberConnectionModel('agar-micro',s);assert.equal(readConnectionModel(s),'agar-micro');s.setItem('studio-keyboard-model','unknown');assert.equal(readConnectionModel(s),'');assert.equal(readConnectionModel(null),'');
});
test('first use asks permission and never selects arbitrary previously authorized serial devices',async()=>{
 const s=store(),other=port();let requests=0;const serial={getPorts:async()=>[other],requestPort:async()=>{requests++;return other}};
 assert.equal(await chooseSerialPort({model:'agar-micro',serial,storage:s}),other);assert.equal(requests,1);
});
test('a uniquely matched successfully recognized port can reconnect without a chooser',async()=>{
 const s=store(),p=port();rememberSerialPort('agar-micro',p,s);let requests=0;const serial={getPorts:async()=>[p,port(1,2)],requestPort:async()=>{requests++;return p}};
 assert.equal(await chooseSerialPort({model:'agar-micro',serial,storage:s}),p);assert.equal(requests,0);
 await chooseSerialPort({model:'agar-micro',serial,storage:s,forcePrompt:true});assert.equal(requests,1);
 await chooseSerialPort({model:'tofu60-ble',serial,storage:s});assert.equal(requests,2);
});
test('revoked, duplicate, unavailable metadata or blocked storage use explicit browser selection',async()=>{
 const s=store(),p=port();rememberSerialPort('agar-micro',p,s);let requests=0;
 for(const ports of [[],[p,port()],[port(1,2)],[{getInfo:()=>({})}]]){const serial={getPorts:async()=>ports,requestPort:async()=>{requests++;return p}};assert.equal(await chooseSerialPort({model:'agar-micro',serial,storage:s}),p);}
 assert.equal(requests,4);const serial={requestPort:async()=>p};assert.equal(await chooseSerialPort({model:'agar-micro',serial,storage:null}),p);
});
test('all six source-backed catalog models route to native ZMK without replacing Agar Micro',()=>{
 const expected=['Agar BLE','Agar Mini BLE','Tofu60 BLE 3.0','Tofu65 BLE 3.0','Tofu TKL BLE 3.0','Tofu Pad BLE'];
 const sourced=CONNECTION_MODELS.filter(m=>m.source);assert.deepEqual(sourced.map(m=>m.name).sort(),expected.sort());
 assert.equal(new Set(CONNECTION_MODELS.map(m=>m.id)).size,CONNECTION_MODELS.length);
 const s=store();for(const m of sourced){assert.equal(m.protocol,'zmk');assert.match(m.source,/^https:\/\/github\.com\/openkbd\/zmk-config-/);rememberConnectionModel(m.id,s);assert.equal(readConnectionModel(s),m.id);}
 assert.equal(connectionModel('agar-micro').name,'Agar Micro');
});
