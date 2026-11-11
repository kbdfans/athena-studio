import test from 'node:test';
import assert from 'node:assert/strict';
import {PetGroundMotion,scenePixel} from '../src/pet-scene.js';
function advance(m,from,to,action,stage=2){for(let t=from;t<=to;t+=50)m.tick(t,action,stage);return Math.floor(m.units/1000);}
test('walk and run scroll left at 16 and 48 pixels per second with seamless wrapping',()=>{
 const walk=new PetGroundMotion(),run=new PetGroundMotion();
 assert.equal(advance(walk,0,1000,1),16);assert.equal(advance(run,0,1000,2),48);
 assert.equal(advance(run,1050,3000,2),16);
 for(let y=98;y<128;y++)for(let x=0;x<128;x++)assert.equal(scenePixel(x,y,19),scenePixel((x+19)%128,y));
});
test('switching speeds preserves phase; idle/sleep freeze it without resetting',()=>{
 const m=new PetGroundMotion();advance(m,0,1000,1);assert.equal(m.tick(1000,2),16);
 assert.equal(advance(m,1050,2000,2),64);assert.equal(m.tick(2000,0),64);
 assert.equal(advance(m,2050,3000,0),64);assert.equal(advance(m,3050,4000,3),64);
 assert.equal(m.tick(4000,1),64);assert.equal(advance(m,4050,5000,1),80);
});
test('hidden tab gaps and egg stage do not jump the ground; clock wrap is bounded',()=>{
 const m=new PetGroundMotion();advance(m,0,1000,2);assert.equal(m.tick(50000,2),48);
 assert.equal(m.tick(50000,1,0),48);assert.equal(advance(m,50050,51000,1,0),48);
 const wrap=new PetGroundMotion();wrap.tick(0xfffffff0,2);assert.equal(wrap.tick(34,2),2);
});
test('sky and overlay region stay fixed while grass moves',()=>{
 for(let y=0;y<98;y++)for(let x=0;x<128;x++)assert.equal(scenePixel(x,y,57),scenePixel(x,y,0));
});

test('jump keeps walking/running ground speed and standing jumps also scroll',()=>{
 for(const action of [0,1,2]){
  const m=new PetGroundMotion();advance(m,0,500,action);const start=m.tick(500,6);
  const end=advance(m,550,1000,6);assert.equal(end-start,action===2?24:8);
  m.tick(1000,0);assert.equal(advance(m,1050,1500,0),end);
 }
});
