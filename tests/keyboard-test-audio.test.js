import test from 'node:test';
import assert from 'node:assert/strict';
import {TestAudio,readTestAudioSettings} from '../src/keyboard-test-audio.js';
function mock(){
 const nodes=[],levels=[];
 const context={state:'suspended',currentTime:0,destination:{},async resume(){this.state='running'},createOscillator(){const n={frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){this.disconnected=true},start(){},stop(at){this.stopAt=at}};nodes.push(n);return n},createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(v){levels.push(v)}},connect(){},disconnect(){}}}};
 return {context,nodes,levels};
}
test('audio initializes on interaction; mute and suspended state generate no sound',async()=>{
 const m=mock();let created=0;const a=new TestAudio(()=>{created++;return m.context});
 a.play('digital',20);assert.equal(created,0);await a.enable();assert.equal(created,1);
 a.play('off',20);a.play('digital',0);assert.equal(m.nodes.length,0);
 a.play('digital',20);assert.equal(m.nodes.length,1);assert.ok(m.nodes[0].stopAt<.1);
 m.nodes[0].onended();assert.equal(a.voices.size,0);assert.equal(m.nodes[0].disconnected,true);
});
test('all tones are bounded, short, and limited to six simultaneous voices',async()=>{
 const m=mock(),a=new TestAudio(()=>m.context);await a.enable();
 for(let i=0;i<10;i++)a.play(['digital','arcade','soft'][i%3],200);
 assert.equal(m.nodes.length,6);assert.ok(Math.max(...m.levels)<=.16);
 assert.ok(m.nodes.every(n=>n.stopAt<=.12));
});
test('invalid sound preferences and unavailable storage recover to a low volume default',()=>{
 assert.deepEqual(readTestAudioSettings({getItem(){throw Error('unavailable')}}),{sound:'digital',volume:20});
 assert.deepEqual(readTestAudioSettings({getItem:()=>'{broken'}),{sound:'digital',volume:20});
 assert.deepEqual(readTestAudioSettings({getItem:()=>JSON.stringify({sound:'invalid',volume:-5})}),{sound:'digital',volume:0});
});
