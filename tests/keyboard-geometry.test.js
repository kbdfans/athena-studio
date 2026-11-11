import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { keyboardLayout } from '../src/keyboard-layout.js';
import { KEYBOARD_MM, keycapRectMm, keycapStyle } from '../src/keyboard-geometry.js';
const definition = JSON.parse(fs.readFileSync(new URL('../src/athena-definition.json', import.meta.url)));
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('physical widths preserve one millimetre gaps through long-key rows', () => {
  const keys = keyboardLayout(definition, 10);
  for (const [unit, width] of [[1,18],[1.25,22.75],[1.5,27.5],[1.75,32.25],[2,37],[2.25,41.75],[6.25,117.75]]) {
    const key = keys.find(k => k.w === unit && k.h === 1);
    assert.equal(keycapRectMm(key).width, width);
    assert.equal(keycapRectMm(key).height, 18);
  }
  for (const key of keys) {
    const next = keys.find(k => k.y === key.y && k.x === key.x + key.w);
    if (!next) continue;
    const a = keycapRectMm(key), b = keycapRectMm(next);
    close(b.x - a.x - a.width, 1);
  }
  // Tab, Caps and Shift rows end at the same main-cluster edge.
  const ends = [1.25,2.25,3.25].map(y => {
    const k = keys.find(k => k.y === y && k.x + k.w === 15);
    const r = keycapRectMm(k); return r.x + r.width;
  });
  assert.deepEqual(ends, [284,284,284]);
});

test('all layout alternatives stay in physical bounds, including ISO Enter', () => {
  for (let v = 0; v < 16; v++) {
    const keys = keyboardLayout(definition, 10 | (v << 5));
    for (const k of keys) {
      const r = keycapRectMm(k);
      assert.ok(r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0);
      assert.ok(r.x + r.width <= KEYBOARD_MM.width);
      assert.ok(r.y + r.height <= KEYBOARD_MM.height);
      if (k.h > 1) {
        assert.equal(r.width, 27.5);
        assert.equal(r.height, 37);
        assert.match(keycapStyle(k), /clip-path:polygon\(/);
      }
    }
  }
});

test('responsive board scaling keeps 1U square and gap at 1/18 of the cap', () => {
  const keys = keyboardLayout(definition, 10);
  const a = keycapRectMm(keys.find(k => k.x === 0 && k.y === 1.25));
  const b = keycapRectMm(keys.find(k => k.x === 1 && k.y === 1.25));
  for (const width of [480,800,1100]) {
    const height = width * KEYBOARD_MM.height / KEYBOARD_MM.width;
    const capW = a.width / KEYBOARD_MM.width * width;
    const capH = a.height / KEYBOARD_MM.height * height;
    const gap = (b.x - a.x - a.width) / KEYBOARD_MM.width * width;
    close(capW, capH); close(gap / capW, 1/18);
  }
});

// Reference enclosure: navigation and right arrow share a column, with no
// extra separator between the typing area and navigation keys.
test('enclosure reference aligns the navigation column and inverted-T arrows', () => {
  const keys = keyboardLayout(definition, 10);
  const at = (r,c) => keys.find(k => k.row === r && k.col === c);
  const right = at(8,3), down = at(9,3), up = at(9,1), left = at(9,4);
  assert.equal(right.x,15); assert.equal(up.x,down.x); assert.equal(left.x+1,down.x);
  for (const y of [0,1.25,2.25,3.25]) {
    const nav = keys.find(k => k.x===15 && k.y===y);
    assert.ok(nav); close(keycapRectMm(nav).x+keycapRectMm(nav).width,KEYBOARD_MM.width);
  }
  const top = keys.filter(k => k.y===0).sort((a,b)=>a.x-b.x);
  close(top[1].x,1.2); close(top[5].x,5.4); close(top[9].x,9.6);
});

test('ISO Enter has a top-left overhang and a bottom-left cutout', () => {
  const key=keyboardLayout(definition,138).find(k=>k.h===2);
  const points=keycapStyle(key).match(/polygon\(([^)]+)\)/)[1]
    .split(',').map(p=>p.trim().split(/\s+/).map(parseFloat));
  const contains=(x,y)=> {
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++) {
      const [xi,yi]=points[i], [xj,yj]=points[j];
      if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside;
  };
  assert.equal(contains(5,25),true);
  assert.equal(contains(5,75),false);
  assert.equal(contains(75,25),true);
  assert.equal(contains(75,75),true);
  // The top arm ends at 18 mm, leaving 1 mm above the neighbouring lower key.
  close(points[4][1]/100*37,18);
});
