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
