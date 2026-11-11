import test from 'node:test';
import assert from 'node:assert/strict';
import {editableKeyName,pickerKeys} from '../src/key-picker.js';
import {parseKeycode} from '../src/keycodes.js';
test('friendly names round trip without confusing numpad and ordinary keys',()=>{
 for(const c of [0,1,4,44,89,98,99,40,88,0x5221,0x5702,0x7703,0x6fff])assert.equal(parseKeycode(editableKeyName(c)),c);
 assert.equal(editableKeyName(44),'Space');assert.equal(editableKeyName(89),'KC_KP_1');
});
test('picker supports Chinese and QMK search, and limits dual-role tap choices to basic codes',()=>{
 assert.ok(pickerKeys('空格').some(k=>k.code===44));assert.ok(pickerKeys('KC_KP_7').some(k=>k.code===95));
 assert.ok(pickerKeys('MO(1)','全部').some(k=>k.code===0x5221));assert.equal(pickerKeys('MO(1)','全部',true).length,0);
 assert.ok(pickerKeys('','全部',true).every(k=>k.code<256));assert.ok(pickerKeys('','小键盘').every(k=>k.category==='小键盘'));
});
