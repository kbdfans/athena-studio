import test from 'node:test';
import assert from 'node:assert/strict';
import { playStoredImage } from '../src/image-playback.js';
import { encodeQgf } from '../src/format-v2.js';
function fixture({empty=false,off=false,ignored=false,phase=5}={}) {
 const calls=[]; let status={mode:1,image:0,ready:true};
 const d={device:{opened:true},pending:false,
  async read(){calls.push('read');return empty?new Uint8Array(256).fill(255):encodeQgf([{data:new Uint16Array(16384),delay:100}],1).slice(0,256);},
  async info(){return {lcdOff:off,phase};},
  async petCommand(op,value){calls.push(op??16);if(op===20&&!ignored)status={...status,mode:0,image:value};return {...status};}
 };return {d,calls};
}
test('stored image selection waits for polling and independently verifies selected mode and playback',async()=>{
 const {d,calls}=fixture();d.pending=true;
 const result=await playStoredImage(d,1,async()=>{d.pending=false;});
 assert.equal(result.status.image,1);assert.equal(result.alreadySelected,false);
 assert.deepEqual(calls,['read',16,20,16]);
 assert.equal((await playStoredImage(d,1,async()=>{})).alreadySelected,true);
});
test('empty slots, screen-off, ignored selection and renderer failures never report playback success',async()=>{
 for(const [options,message]of [[{empty:true},/还没有动画/],[{off:true},/屏幕当前已关闭/],[{ignored:true},/未确认切换/],[{phase:6},/未能加载图片/],[{phase:7},/尚未确认屏幕播放/]]){
  const {d,calls}=fixture(options);await assert.rejects(playStoredImage(d,1,async()=>{}),message);
  if(options.empty||options.off)assert.ok(!calls.includes(20));
 }
});
