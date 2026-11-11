import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWriteFeedback } from '../src/write-feedback.js';
function fixture() {
  const nodes = new Map(); let time=0, tick, stops=0, celebrations=0, cleared=0;
  const root={getElementById(id){
    if(id==='screen-dialog') return null;
    if(id==='transfer-dialog'&&!nodes.has(id)) nodes.set(id,{open:false,showModal(){this.open=true;},close(){this.open=false;},focus(){},addEventListener(name,fn){this[name]=fn;}});
    if(!nodes.has(id)) nodes.set(id,{id,textContent:id==='write'?'写入键盘 ↗':'',dataset:{},hidden:true,style:{setProperty(){},removeProperty(){}},setAttribute(k,v){this[k]=v;}});
    return nodes.get(id);
  }};
  return {f:setupWriteFeedback(root,{now:()=>time,every:fn=>{tick=fn;return 1;},stop:()=>stops++,celebrate:()=>{celebrations++;return ()=>cleared++;}}),$:root.getElementById,advance(ms){time+=ms;tick?.();},get stops(){return stops;},get celebrations(){return celebrations;},get cleared(){return cleared;}};
}
test('transfer remains busy through 100% transport and verification; only explicit verified completion succeeds',()=>{
 const t=fixture();t.f.start({target:'图片 2',backup:false,filename:'example.gif'});
 t.f.progress(100,'传输完成','verify');
 assert.equal(t.f.active,true);assert.equal(t.$('progress').value,99);
 assert.equal(t.$('progress-area').dataset.state,'verify');assert.equal(t.f.dismiss(),false);
 t.advance(17000);t.f.complete({seconds:17,details:'校验通过'});
 assert.equal(t.f.active,false);assert.equal(t.$('progress-area').dataset.state,'success');
 assert.equal(t.$('progress').value,100);assert.equal(t.$('transfer-elapsed').textContent,'17.0 秒');
 assert.equal(t.$('transfer-file').textContent,'example.gif');assert.equal(t.stops,1);
 assert.equal(t.f.dismiss(),true);assert.equal(t.$('write').textContent,'写入键盘 ↗');
});
test('verification failure persists without reporting success and a new operation clears stale error',()=>{
 const t=fixture();t.f.start({target:'图片 1',backup:true});t.f.progress(90,'核对','verify');
 t.f.fail('CRC 不匹配');t.f.complete();t.f.progress(100);
 assert.equal(t.$('progress-area').dataset.state,'error');assert.equal(t.$('transfer-error').textContent,'CRC 不匹配');
 assert.equal(t.$('progress').value,90);assert.equal(t.stops,1);assert.equal(t.$('transfer-dismiss').disabled,false);
 t.f.start({target:'图片 3',filename:'new.gif',backup:false});
 assert.equal(t.$('transfer-error').textContent,'');assert.equal(t.$('transfer-details').hidden,true);
 assert.equal(t.$('transfer-step-backup').hidden,true);assert.equal(t.$('transfer-title').textContent,'图片 3');
 assert.equal(t.$('progress').value,0);t.f.fail('cleanup');
});
test('pet activation uses shared feedback without pretending to upload or verify an image',()=>{
 const t=fixture();t.$('pet-enable').textContent='在键盘上启用 ↗';
 t.f.start({target:'电子宠物',buttonId:'pet-enable',kind:'activation'});
 assert.equal(t.$('transfer-steps').hidden,true);assert.equal(t.$('progress-area').dataset.state,'activate');
 t.f.complete({title:'猫猫已就位',description:'屏幕已切换',buttonLabel:'已启用'});
 assert.equal(t.$('progress-text').textContent,'屏幕已切换');assert.equal(t.$('pet-enable').textContent,'已启用');
 t.f.dismiss();assert.equal(t.$('pet-enable').textContent,'在键盘上启用 ↗');
});

test('modal blocks escape while writing and celebrates once only after verified success',()=>{
 const t=fixture();t.f.start({target:'图片 1'});assert.equal(t.$('transfer-dialog').open,true);
 let prevented=false;t.$('transfer-dialog').cancel({preventDefault(){prevented=true;}});
 assert.equal(prevented,true);assert.equal(t.$('transfer-dialog').open,true);
 t.f.progress(100,'校验中','verify');assert.equal(t.celebrations,0);
 t.f.complete();t.f.complete();assert.equal(t.celebrations,1);
 t.$('transfer-dialog').cancel({preventDefault(){}});assert.equal(t.$('transfer-dialog').open,false);assert.equal(t.cleared,1);
 t.f.start({target:'图片 2'});t.f.fail('错误');assert.equal(t.celebrations,1);t.f.dismiss();
});
