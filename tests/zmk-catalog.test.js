import test from 'node:test';
import assert from 'node:assert/strict';
import {ZMK_KEYS,ZMK_MEDIA,behaviorHelp,behaviorInCategory} from '../src/zmk-catalog.js';
import {validBinding} from '../src/zmk-model.js';
import {translate} from '../src/i18n-core.js';
test('native keyboard usages never contain QMK internal media/mouse codes',()=>{
 assert.equal(new Set(ZMK_KEYS.map(k=>k.code)).size,ZMK_KEYS.length);for(const code of [0xa8,0xab,0xae,0xcd,0xd1,0x5221])assert(!ZMK_KEYS.some(k=>k.code===code));assert(ZMK_MEDIA.some(([label,usage])=>label==='播放 / 暂停'&&usage===0xcd));
});
test('ZMK behavior help groups native features and preserves custom behavior uncertainty',()=>{
 for(const name of ['Key Press','Layer Tap','Mod-Tap','Momentary Layer','Sticky Key','Sticky Layer','Bluetooth','Output Selection','RGB Underglow','Bootloader','Tap Dance','Macro']){const h=behaviorHelp({displayName:name});assert.notEqual(h.kind,'custom');assert(h.description&&h.example);assert(!/[\u4e00-\u9fff]/.test(translate(h.description,'en')));assert(!/[\u4e00-\u9fff]/.test(translate(h.example,'en')));}
 assert(behaviorInCategory({displayName:'Momentary Layer'},'常用层切换'));assert(!behaviorInCategory({displayName:'Mod-Tap'},'常用层切换'));assert.equal(behaviorHelp({displayName:'User macro A'}).kind,'custom');
});
test('HID modifier combinations validate without becoming QMK MT/LT codes',()=>{const b=[{id:20,metadata:[{param1:[{hidUsage:{keyboardMax:231,consumerMax:767}}],param2:[]}]}];assert(validBinding({behaviorId:20,param1:0x1070006,param2:0},b,[]));assert(!validBinding({behaviorId:20,param1:0x5221,param2:0},b,[]));});
test('Agar vendor layer and device behaviors appear in Basic with native semantics',()=>{
 const layers=[
  ['Layer Momentary','&mo 1'],['Layer-Tap(TP)','&lt 1 SPACE'],['Layer-Tap(HP)','&lt_hp 1 SPACE'],
  ['Layer Toggle','&tog 1'],['Layer To','&to 1'],['Layer Sticky','&sl 1'],
 ];
 for(const [name,command] of layers){
  const b={displayName:name};assert(behaviorInCategory(b,'常用层切换'),name);const h=behaviorHelp(b);assert.equal(h.command,command);for(const text of [h.title,h.description,h.example,h.note])assert(!/[\u4e00-\u9fff]/.test(translate(text,'en')),text);
 }
 assert.equal(behaviorHelp({displayName:'Vendor Layer',metadata:[{param1:[{layerId:{}}]}]}).command,undefined);
 for(const [name,title]of [['Device_USB','切换 USB 模式'],['Device_BT1','蓝牙设备 1'],['Device_BT2','蓝牙设备 2'],['Device_BT3','蓝牙设备 3'],['Device_BT10','蓝牙设备 10']]){
  const b={displayName:name},h=behaviorHelp(b);assert(behaviorInCategory(b,'蓝牙与输出'));assert.equal(h.title,title);assert.deepEqual(h.params,[]);for(const text of [h.title,h.description,h.example,h.note])assert(!/[\u4e00-\u9fff]/.test(translate(text,'en')),text);
 }
 assert(!behaviorInCategory({displayName:'Mod-Tap(TP)'},'常用层切换'));
 assert(behaviorInCategory({displayName:'Vendor Layer',metadata:[{param1:[{layerId:{}}],param2:[]}]},'常用层切换'));
 assert.equal(behaviorHelp({displayName:'DeviceMystery'}).kind,'custom');
 assert.equal(behaviorHelp({displayName:'Key(None)'}).kind,'none');
 for(const name of ['Mouse Key Press','Mouse Move Left','Mouse Scroll Up'])assert(behaviorInCategory({displayName:name},'鼠标与滚轮'));
});
