import {sameBinding,validateZmkData,validBinding} from './zmk-model.js';
// All operations, including delayed commits, share one queue. No stale replay on reconnect.
export class ZmkRuntime {
 constructor(rpc,{onChange=()=>{},saveDelay=350}={}){
  this.rpc=rpc;this.protocol='zmk';this.device={opened:true};this.isRuntime=true;this.capabilities={screen:false,matrix:false,firmwareUpgrade:false};this.broken=false;this.pending=false;this.dirty=false;this.error=null;this.locked=false;this.onChange=onChange;this.saveDelay=saveDelay;this.tail=Promise.resolve();this.queued=0;this.history=[];
 }
 emit(){this.onChange(this);}
 queue(fn){this.queued++;this.emit();const result=this.tail.then(async()=>{if(this.broken||!this.device.opened)throw Error('键盘已断开，请重新连接');this.pending=true;try{return await fn();}finally{this.pending=false;}});this.tail=result.catch(()=>{}).finally(()=>{this.queued--;this.emit();});return result;}
 async request(group,value){const r=await this.rpc.call({[group]:value});if(!r?.[group])throw Error('ZMK 返回了不兼容的响应');return r[group];}
 async initialize(){
  const info=(await this.request('core',{getDeviceInfo:true})).getDeviceInfo;if(!info?.name)throw Error('未识别到 ZMK Studio 键盘');
  this.info=info;this.profile={id:'zmk',name:info.name,protocol:'zmk'};
  this.locked=(await this.request('core',{getLockState:true})).getLockState!==1;
  if(!this.locked)await this.reload();return this;
 }
 async reload(){return this.queue(async()=>{
  this.locked=(await this.request('core',{getLockState:true})).getLockState!==1;
  if(this.locked)throw Error('键盘已锁定，请按固件设置的 Studio 解锁键后重新读取');
  const physical=(await this.request('keymap',{getPhysicalLayouts:true})).getPhysicalLayouts;
  const map=(await this.request('keymap',{getKeymap:true})).getKeymap;validateZmkData(map,physical);
  const ids=(await this.request('behaviors',{listAllBehaviors:true})).listAllBehaviors?.behaviors;
  if(!ids||ids.length>512)throw Error('ZMK 功能列表无效');
  const behaviors=[];for(const behaviorId of ids){const b=(await this.request('behaviors',{getBehaviorDetails:{behaviorId}})).getBehaviorDetails;if(!b||b.id!==behaviorId||!Array.isArray(b.metadata))throw Error('ZMK 功能说明不完整');behaviors.push(b);}
  this.map=map;this.physical=physical;this.behaviors=behaviors;this.history=[];this.error=null;this.uncertain=false;
  // Existing unsaved changes belong to the device, not this site's autosave policy.
  this.dirty=(await this.request('keymap',{checkUnsavedChanges:true})).checkUnsavedChanges===true;this.preexistingDirty=this.dirty;
  this.emit();return map;
 });}
 assertEditable(){if(this.error)throw Error('同步未确认，请重新读取键盘');if(this.locked)throw Error('键盘已锁定，请先解锁');if(this.preexistingDirty)throw Error('键盘有之前未保存的修改，请先确认保留或放弃');}
 async assign(layerId,keyPosition,binding,{record=true}={}){return this.queue(async()=>{
  this.assertEditable();const layer=this.map.layers.find(l=>l.id===layerId);const max=this.physical.layouts[this.physical.activeLayoutIndex].keys.length;
  if(!layer||!Number.isInteger(keyPosition)||keyPosition<0||keyPosition>=max||!validBinding(binding,this.behaviors,this.map.layers))throw Error('此按键功能或参数不受当前固件支持');
  const before=layer.bindings[keyPosition];if(sameBinding(before,binding))return;
  try{
   const r=await this.request('keymap',{setLayerBinding:{layerId,keyPosition,binding}});if(r.setLayerBinding!==0)throw Error('键盘拒绝了本次改键');
   this.dirty=true;layer.bindings[keyPosition]={...binding};
   const read=(await this.request('keymap',{getKeymap:true})).getKeymap;validateZmkData(read,this.physical);
   if(!sameBinding(read.layers.find(l=>l.id===layerId)?.bindings[keyPosition],binding))throw Error('ZMK 改键回读不一致');
   this.map=read;if(record)this.history.push({layerId,keyPosition,before:{...before},after:{...binding},layout:this.physical.activeLayoutIndex});
   this.scheduleSave();this.emit();
  }catch(e){clearTimeout(this.saveTimer);this.uncertain=true;this.error=e;this.emit();throw e;}
 });}
 scheduleSave(){clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>{this.flush().catch(()=>{});},this.saveDelay);}
 async commit(){
  if(this.preexistingDirty)throw Error('键盘有之前未保存的修改，请先确认保留或放弃');
  if(this.uncertain)throw Error('同步未确认，请重新读取键盘');
  if(!this.dirty)return;
  try{const result=(await this.request('keymap',{saveChanges:true})).saveChanges;
   if(result?.ok!==true)throw Error(result?.err===3?'键盘存储空间不足，修改尚未保存':'ZMK 自动保存失败，修改尚未保存');
   if((await this.request('keymap',{checkUnsavedChanges:true})).checkUnsavedChanges!==false)throw Error('键盘仍有未保存的修改');
   this.dirty=false;this.preexistingDirty=false;this.error=null;
  }catch(e){this.error=e;throw e;}finally{this.emit();}
 }
 flush(){clearTimeout(this.saveTimer);return this.queue(()=>this.commit());}
 async resolveExisting(keep){if(keep)return this.queue(async()=>{this.preexistingDirty=false;await this.commit();});return this.queue(async()=>{const r=await this.request('keymap',{discardChanges:true});if(r.discardChanges!==true)throw Error('无法放弃未保存的修改');this.dirty=false;this.preexistingDirty=false;}).then(()=>this.reload());}
 async selectLayout(index){return this.queue(async()=>{
  this.assertEditable();if(!Number.isInteger(index)||!this.physical.layouts[index])throw Error('此布局不在固件支持范围内');if(index===this.physical.activeLayoutIndex)return;
  await this.commit();
  try{const r=(await this.request('keymap',{setActivePhysicalLayout:index})).setActivePhysicalLayout;if(!r?.ok)throw Error('键盘拒绝了布局切换');
   this.dirty=true;const physical=(await this.request('keymap',{getPhysicalLayouts:true})).getPhysicalLayouts;const map=(await this.request('keymap',{getKeymap:true})).getKeymap;
   validateZmkData(map,physical);if(physical.activeLayoutIndex!==index)throw Error('ZMK 布局回读不一致');
   this.physical=physical;this.map=map;this.history=[];this.emit();await this.commit();
  }catch(e){clearTimeout(this.saveTimer);this.uncertain=true;this.error=e;this.emit();throw e;}
 });}
 async undo(){const h=this.history.at(-1);if(!h||h.layout!==this.physical.activeLayoutIndex)return;await this.assign(h.layerId,h.keyPosition,h.before,{record:false});this.history.pop();this.emit();}
 disconnected(){clearTimeout(this.saveTimer);this.broken=true;this.device.opened=false;this.error=Error(this.dirty?'连接已断开，最后的修改可能尚未保存':'键盘已断开');this.emit();}
 async close(){clearTimeout(this.saveTimer);if(!this.broken&&this.device.opened&&!this.preexistingDirty&&!this.uncertain)await this.flush();this.device.opened=false;await this.rpc.close();this.emit();}
}
