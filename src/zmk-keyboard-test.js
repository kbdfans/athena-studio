import {keypressBehavior,zmkGeometry} from './zmk-model.js';
import {ZMK_KEYS,behaviorHelp} from './zmk-catalog.js';
import {platformKeyLabel} from './platform-keys.js';
import {browserCode} from './keyboard-test-state.js';

// Browser events identify output, never physical switches or the active layer.
// Plain bindings with the same browser code share one testable output.
export function zmkTestLayout(device,layerId){
 const layer=device.map?.layers.find(l=>l.id===layerId)||device.map?.layers[0];
 const layout=device.physical?.layouts[device.physical.activeLayoutIndex];
 if(!layer||!layout)return null;
 const geometry=zmkGeometry(layout),kp=keypressBehavior(device.behaviors),counts=new Map();
 const keys=geometry.keys.map(k=>{
  const binding=layer.bindings[k.position],behavior=device.behaviors.find(b=>b.id===binding?.behaviorId);
  const plain=!!binding&&!!kp&&binding.behaviorId===kp.id&&((binding.param1>>>16)&255)===7&&!(binding.param1>>>24);
  const usage=binding?.param1&65535,code=plain?browserCode(usage):null;
  const help=behavior?behaviorHelp(behavior):null;
  const behaviorLabel=help&&['mo','tog','to','sl'].includes(help.kind)?`${help.kind.toUpperCase()}(${binding.param1})`:help&&['lt','mt'].includes(help.kind)?help.kind.toUpperCase():help?.title;
  const label=plain?platformKeyLabel(ZMK_KEYS.find(k=>k.code===usage)||{code:usage,label:'0x'+usage.toString(16)}):behaviorLabel||'—';
  if(code)counts.set(code,(counts.get(code)||0)+1);
  return {...k,id:`z:${k.position}`,label,code};
 });
 const ambiguous=new Set([...counts].filter(([,n])=>n>1).map(([code])=>code));
 return {...geometry,layer,keys:keys.map(k=>({...k,reason:!k.code?'此功能不提供可定位的普通按键输出':ambiguous.has(k.code)?'多个位置输出相同，浏览器无法区分':''})),ambiguous};
}
