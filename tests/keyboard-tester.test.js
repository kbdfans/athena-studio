import test from 'node:test';
import assert from 'node:assert/strict';
import { KeyboardTestState, matrixKeys, browserCode } from '../src/keyboard-test-state.js';
test('simultaneous keys, repeats, releases and fresh presses retain accurate test coverage',()=>{
 const s=new KeyboardTestState();
 assert.deepEqual(s.update(['10,0','0,1']),['10,0','0,1']);
 assert.equal(s.total,2);
 assert.deepEqual(s.update(['10,0','0,1','0,1']),[]);
 assert.equal(s.total,2);
 s.update(['10,0']); assert.equal(s.held.size,1); assert.equal(s.seen.size,2);
 s.update(['10,0','0,1']); assert.equal(s.total,3); assert.equal(s.seen.size,2);
 s.release(); assert.equal(s.held.size,0); assert.equal(s.seen.size,2);
 s.clear(); assert.equal(s.total,0); assert.equal(s.seen.size,0); assert.deepEqual(s.history,[]);
});
test('11x8 matrix bit order maps physical positions including Fn and last row',()=>{
 const rows=Array(11).fill(0);rows[0]=129;rows[10]=5;
 assert.deepEqual(matrixKeys(rows),['0,0','0,7','10,0','10,2']);
 assert.throws(()=>matrixKeys([0])); rows[0]=256;assert.throws(()=>matrixKeys(rows));
});
test('browser physical codes distinguish left and right modifiers; firmware-only keys are unmapped',()=>{
 assert.equal(browserCode(4),'KeyA');assert.equal(browserCode(39),'Digit0');
 assert.equal(browserCode(224),'ControlLeft');assert.equal(browserCode(228),'ControlRight');
 assert.equal(browserCode(0x5221),undefined);assert.equal(browserCode(0x7e04),undefined);
});
