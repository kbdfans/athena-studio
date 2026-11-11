const clone=structuredClone;
const key=(x=0)=>({width:100,height:100,x,y:0,r:0,rx:0,ry:0});
const binding=n=>({behaviorId:7,param1:0x70000+n,param2:0});
export function fakeZmk(){
 const physical={activeLayoutIndex:0,layouts:[{name:'ANSI',keys:[key(),key(100)]},{name:'Split',keys:[key(),key(100),key(200)]}]};
 const map={layers:[{id:3,name:'Base',bindings:[binding(4),binding(5),binding(6)]},{id:9,name:'Fn',bindings:[binding(7),binding(8),binding(9)]}],availableLayers:2,maxLayerNameLength:16};
 const behaviors=[{id:7,displayName:'Key Press',metadata:[{param1:[{name:'Key',hidUsage:{keyboardMax:255,consumerMax:1023}}],param2:[{nil:{},name:''}]}]},{id:12,displayName:'Momentary Layer',metadata:[{param1:[{layerId:{},name:'Layer'}],param2:[]}]}];
 let dirty=false,persisted=clone(map),persistedLayout=0;
 const fake={physical,map,behaviors,ops:[],saved:0,saveError:null,locked:false,readbackError:false,closed:false,
  async call(req){fake.ops.push(clone(req));if(req.core)return {core:req.core.getDeviceInfo?{getDeviceInfo:{name:'Tofu60 BLE',serialNumber:new Uint8Array([1,2])}}:{getLockState:fake.locked?0:1}};
   if(req.behaviors)return {behaviors:req.behaviors.listAllBehaviors?{listAllBehaviors:{behaviors:behaviors.map(b=>b.id)}}:{getBehaviorDetails:clone(behaviors.find(b=>b.id===req.behaviors.getBehaviorDetails.behaviorId))}};
   const r=req.keymap;
   if(r.getPhysicalLayouts)return {keymap:{getPhysicalLayouts:clone(physical)}};
   if(r.getKeymap){const read=clone(map);if(fake.readbackError)read.layers[0].bindings[0]=binding(99);return {keymap:{getKeymap:read}};}
   if(r.checkUnsavedChanges)return {keymap:{checkUnsavedChanges:dirty}};
   if(r.setLayerBinding){const {layerId,keyPosition,binding:b}=r.setLayerBinding;map.layers.find(l=>l.id===layerId).bindings[keyPosition]=clone(b);dirty=true;return {keymap:{setLayerBinding:0}};}
   if(r.saveChanges){fake.saved++;if(fake.saveError!==null)return {keymap:{saveChanges:{err:fake.saveError}}};dirty=false;persisted=clone(map);persistedLayout=physical.activeLayoutIndex;return {keymap:{saveChanges:{ok:true}}};}
   if(r.setActivePhysicalLayout!==undefined){physical.activeLayoutIndex=r.setActivePhysicalLayout;dirty=true;return {keymap:{setActivePhysicalLayout:{ok:clone(map)}}};}
   if(r.discardChanges){map.layers=clone(persisted.layers);physical.activeLayoutIndex=persistedLayout;dirty=false;return {keymap:{discardChanges:true}};}
   throw Error('Unexpected RPC');
  },async close(){fake.closed=true;},powerCycle(){map.layers=clone(persisted.layers);physical.activeLayoutIndex=persistedLayout;dirty=false;},setDirty(){dirty=true;}};
 return fake;
}
