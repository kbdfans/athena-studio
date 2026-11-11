import test from 'node:test';
import assert from 'node:assert/strict';
import { TKL_KEYS, TKL_MM } from '../src/tkl-layout.js';
import { keycapRectMm } from '../src/keyboard-geometry.js';

test('ANSI TKL palette offers exactly the 87 expected distinct keyboard functions', () => {
  const expected = [...Array.from({length:79},(_,i)=>i+4).filter(c=>c!==50),
    ...Array.from({length:8},(_,i)=>224+i),101].sort((a,b)=>a-b);
  assert.equal(TKL_KEYS.length,87);
  assert.deepEqual(TKL_KEYS.map(k=>k.code).sort((a,b)=>a-b),expected);
  assert.equal(TKL_KEYS.find(k=>k.code===229).w,2.75);
  assert.equal(TKL_KEYS.find(k=>k.code===44).w,6.25);
});
test('TKL caps fit the board without overlap and retain independent navigation and arrows', () => {
  const rects=TKL_KEYS.map(keycapRectMm);
  for(const [i,a] of rects.entries()) {
    assert.ok(a.x>=0 && a.y>=0 && a.x+a.width<=TKL_MM.width && a.y+a.height<=TKL_MM.height);
    for(const b of rects.slice(i+1)) assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y);
  }
  const pos=code=>TKL_KEYS.find(k=>k.code===code);
  assert.equal(pos(82).x,pos(81).x);
  assert.equal(pos(73).x,15.25);
  assert.equal(pos(76).y,pos(73).y+1);
});
