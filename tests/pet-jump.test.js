import test from 'node:test';
import assert from 'node:assert/strict';
import {PetMotion} from '../src/pet-preview.js';
import {createPetPack,petFrame} from '../src/pet-pack.js';
import {PetGroundMotion} from '../src/pet-scene.js';
for(const species of ['cat','shiba'])test(`${species}: running jump keeps momentum and lands on a running footfall`,()=>{
 const m=new PetMotion(0,createPetPack('orange',undefined,'original',species)),g=new PetGroundMotion();
 for(let t=0;t<=1000;t+=50){m.key(t);const f=m.tick(t);g.tick(t,f.action);}
 assert.equal(m.action,2);const before=m.tick(1020).jump;m.key(1020,true);
 assert.equal(m.tick(1020).jump,before);
 let apex=0,previous=before;
 for(let t=1020;t<1600;t+=10){if(t===1300)m.key(t,true);const f=m.tick(t);assert.equal(f.action,6);apex=Math.max(apex,f.jump);assert.ok(Math.abs(f.jump-previous)<=3,'no vertical teleport');previous=f.jump;g.tick(t,f.action);assert.equal(g.speed,48);}
 assert.equal(apex,24);// An in-flight Space cannot restart the jump.
 const landed=m.tick(1600);assert.equal(landed.action,2);assert.equal(landed.jump,0);assert.equal(petFrame(m.pack,2,landed.elapsed),3);
 assert.equal(m.tick(2400).action,0);assert.equal(m.tick(32000).action,3);
});
test('walking jump returns to walking; stationary jump remains a full hop',()=>{
 const walk=new PetMotion();walk.key(0);walk.tick(0);walk.key(50,true);
 assert.equal(walk.tick(630).action,1);
 const stand=new PetMotion();stand.key(0,true);assert.equal(stand.tick(1000).action,6);assert.equal(stand.tick(1050).action,0);
});
