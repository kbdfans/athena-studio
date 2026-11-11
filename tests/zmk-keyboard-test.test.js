import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeZmk} from './helpers/zmk-fixture.js';
import {zmkTestLayout} from '../src/zmk-keyboard-test.js';
import {browserCode} from '../src/keyboard-test-state.js';
const kp=usage=>({behaviorId:7,param1:0x70000+usage,param2:0});
test('ZMK tester follows the reported active layout, selected layer and remapped output',()=>{
 const d=fakeZmk();d.physical.activeLayoutIndex=1;d.map.layers[1].bindings[0]=kp(98);
 const board=zmkTestLayout(d,9);assert.equal(board.keys.length,3);assert.equal(board.layer.id,9);assert.equal(board.keys[0].code,'Numpad0');assert.equal(board.keys[1].code,'KeyE');
 assert.deepEqual(d.ops,[]);assert.equal(d.saved,0);
});
test('duplicate output and firmware-only behaviors never count as unique physical positions',()=>{
 const d=fakeZmk();d.physical.activeLayoutIndex=1;
 d.map.layers[0].bindings=[kp(4),kp(4),{behaviorId:12,param1:9,param2:0}];
 const board=zmkTestLayout(d,3);assert.equal(board.keys.filter(k=>k.code).length,0);assert.ok(board.ambiguous.has('KeyA'));assert.match(board.keys[0].reason,/无法区分/);assert.match(board.keys[2].reason,/不提供/);
});
test('modifier combinations, consumer usage and transparent/unknown behaviors are not guessed',()=>{
 const d=fakeZmk();d.physical.activeLayoutIndex=1;
 d.map.layers[0].bindings=[{...kp(6),param1:0x1070006},{...kp(4),param1:0xc00e9},{behaviorId:999,param1:0,param2:0}];
 assert.ok(zmkTestLayout(d,3).keys.every(k=>!k.code&&k.reason));
});
test('ZMK rotated layout keeps physical geometry and distinct positions',()=>{
 const d=fakeZmk();d.physical.layouts[0].keys[0].r=1500;
 const board=zmkTestLayout(d,3);assert.equal(board.keys[0].r,15);assert.equal(board.keys[0].id,'z:0');assert.ok(board.board.height>18);
});
test('browser usage coverage includes keypad, navigation and function keys',()=>{
 for(const [usage,code]of [[83,'NumLock'],[88,'NumpadEnter'],[89,'Numpad1'],[97,'Numpad9'],[98,'Numpad0'],[99,'NumpadDecimal'],[70,'PrintScreen'],[71,'ScrollLock'],[72,'Pause'],[104,'F13'],[115,'F24'],[228,'ControlRight']])assert.equal(browserCode(usage),code);
 assert.equal(browserCode(0x70004),undefined);assert.equal(zmkTestLayout({physical:{layouts:[],activeLayoutIndex:0}},0),null);
});
