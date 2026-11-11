import {ZMK_KEYS,ZMK_MEDIA,ZMK_NUMPAD,behaviorHelp,behaviorInCategory,BASIC_BEHAVIOR_GROUPS,ADVANCED_BEHAVIOR_GROUPS} from './zmk-catalog.js';
import {translate} from './i18n-core.js';
import {platformKeyLabel} from './platform-keys.js';
import {TKL_KEYS,TKL_MM} from './tkl-layout.js';
import {keycapStyle} from './keyboard-geometry.js';
import {usesModifierColor} from './keycap-colors.js';
import {keypressBehavior,validBinding,zmkGeometry} from './zmk-model.js';
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(label,fn,cls='')=>{const b=el('button',cls,label);b.type='button';b.onclick=fn;return b;};
const label=code=>platformKeyLabel(ZMK_KEYS.find(k=>k.code===code)||{code,label:'0x'+code.toString(16),title:'USB HID'});
export function setupZmkUI({getDevice,notice}){
 const root=el('section','keymap-workspace zmk-workspace');root.id='zmk-workspace';root.hidden=true;root.setAttribute('aria-label','ZMK 键位设置');
 document.getElementById('keymap-workspace').after(root);
 root.innerHTML=`<div class="layer-bar"><span class="section-label" data-z="name"></span><div class="layer-chips" data-z="layers"></div><span data-z="status" role="status"></span></div><div class="zmk-warning" data-z="warning" hidden></div><div class="keyboard-stage"><div class="keyboard-scroll"><div class="keyboard-case"><div class="keyboard" data-z="keyboard"></div></div></div></div><aside class="key-inspector"><div class="function-toolbar"><div class="selected-key-row"><span class="section-label">当前选中</span><div class="selected-keycap" data-z="selected"></div><div class="selected-description"><h2 data-z="description"></h2></div><span data-z="position"></span><button data-z="undo" aria-label="撤销上一次改键">撤销</button></div></div><div class="function-sidebar"><div class="key-mode-switch"><button data-z="basic">基础</button><button data-z="advanced">高级</button></div><label class="key-search"><span>⌕</span><input data-z="search" type="search" aria-label="搜索按键或功能" placeholder="搜索功能…"></label><div class="key-categories" data-z="categories"></div><div class="sidebar-tools"><button class="text-button" data-z="reload">重新读取键盘</button><button class="text-button" data-z="export">导出当前键位</button></div></div><div class="zmk-choices" data-z="choices"></div></aside><div class="zmk-sync"><p data-z="sync" role="status" aria-live="polite"></p><button class="text-button" data-z="retry" hidden>重试自动保存</button></div>`;
 const $=name=>root.querySelector(`[data-z="${name}"]`);
 let device=null,layerId=0,position=0,mode='basic',category='基础按键';
 const live=()=>device&&getDevice()===device&&!device.broken&&device.device.opened;
 const act=async fn=>{try{await fn();render();}catch(e){notice(e.message,true);refresh();}};
 function bindingLabel(b){if(!b)return '—';const behavior=device.behaviors.find(x=>x.id===b.behaviorId),kp=keypressBehavior(device.behaviors);
  if(kp?.id===b.behaviorId&&((b.param1>>>16)&255)===7){const mods=b.param1>>>24,names=Array.from({length:8},(_,i)=>label(224+i));return [...names.filter((_,i)=>mods&(1<<i)),label(b.param1&65535)].join('+');}
  if(behavior?.displayName?.toLowerCase().includes('transparent'))return '▽';
  if(!behavior)return `Behavior ${b.behaviorId}`;const help=behaviorHelp(behavior);if(['mo','tog','to','sl'].includes(help.kind))return help.kind.toUpperCase()+'('+b.param1+')';if(['lt','mt'].includes(help.kind))return help.kind.toUpperCase()+' · '+label(b.param2&65535);return help.title;
 }
 function refresh(){
  const active=getDevice()?.protocol==='zmk';root.hidden=!active;document.getElementById('keymap-workspace').hidden=active;if(!active)return;
  const d=getDevice();$('status').textContent=d.locked?'需要解锁':d.broken?'连接已断开':'已连接 · 改键即时生效';
  $('sync').textContent=d.error?.message|| (d.locked?'需要解锁':d.preexistingDirty?'键盘有之前未保存的修改，请先确认保留或放弃':d.pending||d.queued?'正在同步到键盘…':d.dirty?'已生效 · 正在自动保存…':'已保存到键盘');
  $('sync').classList.toggle('error',!!d.error);$('retry').hidden=!d.dirty||!d.error||d.broken||d.preexistingDirty||d.uncertain;
  $('undo').disabled=!d.history.length||!!d.error||d.pending||d.locked;
  $('reload').disabled=d.pending||d.queued>0;
 }
 function render(){
  if(!device||!live()){refresh();return;}
  $('name').textContent=device.profile.name+' · 层';$('warning').replaceChildren();$('warning').hidden=!device.locked&&!device.preexistingDirty;
  if(device.locked){$('warning').append(el('p','','请按键盘固件设置的 Studio 解锁键，再点击重新读取。'));$('keyboard').replaceChildren();$('choices').replaceChildren();refresh();return;}
  if(device.preexistingDirty){$('warning').append(el('p','','键盘有之前未保存的修改，请先确认保留或放弃'),button('保留并保存',()=>act(()=>device.resolveExisting(true)),'outline'),button('放弃未保存修改',()=>act(()=>device.resolveExisting(false)),'text-button'));}
  if(!device.map){refresh();return;}
  if(!device.map.layers.some(l=>l.id===layerId))layerId=device.map.layers[0].id;
  const layer=device.map.layers.find(l=>l.id===layerId),layout=device.physical.layouts[device.physical.activeLayoutIndex],geo=zmkGeometry(layout);
  position=Math.min(position,layout.keys.length-1);$('layers').replaceChildren();
  device.map.layers.forEach((l,i)=>{const b=button(l.name||String(i),()=>{layerId=l.id;render();});b.classList.toggle('selected',l.id===layerId);b.setAttribute('aria-pressed',String(l.id===layerId));$('layers').append(b);});
  const board=$('keyboard');board.replaceChildren();board.style.aspectRatio=`${geo.board.width} / ${geo.board.height}`;
  // Limit visual height without distorting 1U caps. Preserve rotation centres.
  const boardWidth=Math.min(1200,geo.board.width/geo.board.height*340,geo.board.width/19*64);board.parentElement.style.width=`min(100%, ${boardWidth}px)`;board.parentElement.style.setProperty('--zmk-min-board',Math.min(600,boardWidth)+'px');
  geo.keys.forEach(k=>{const b=button(bindingLabel(layer.bindings[k.position]),()=>{position=k.position;render();},'keycap');b.style.cssText=keycapStyle(k,geo.board);if(k.r){b.style.transformOrigin=`${(k.rx-k.x)*19/(k.w*19-1)*100}% ${(k.ry-k.y)*19/(k.h*19-1)*100}%`;b.style.transform=`rotate(${k.r}deg)`;}
   b.classList.toggle('selected',k.position===position);const binding=layer.bindings[k.position],kp=keypressBehavior(device.behaviors);b.classList.toggle('modifier',binding.behaviorId===kp?.id&&((binding.param1>>>16)&255)===7?usesModifierColor(binding.param1&65535,k.w):true);b.title=b.textContent;b.setAttribute('aria-pressed',String(k.position===position));b.dataset.position=k.position;board.append(b);});
  const current=layer.bindings[position];$('selected').textContent=bindingLabel(current);const currentBehavior=device.behaviors.find(b=>b.id===current.behaviorId);$('description').textContent=currentBehavior?behaviorHelp(currentBehavior).title:'—';$('description').title=currentBehavior?behaviorHelp(currentBehavior).description+' '+behaviorHelp(currentBehavior).example:'';$('position').textContent=`${layer.name||layerId} · ${position+1}`;
  $('basic').classList.toggle('selected',mode==='basic');$('advanced').classList.toggle('selected',mode==='advanced');
  $('categories').replaceChildren();for(const name of mode==='basic'?['基础按键','数字小键盘','媒体控制',...BASIC_BEHAVIOR_GROUPS]:ADVANCED_BEHAVIOR_GROUPS){const b=button(name,()=>{category=name;$('search').value='';renderChoices();},'category-tab');b.dataset.category=name;$('categories').append(b);}
  renderChoices();refresh();
 }
 function assign(binding){const l=layerId,p=position;return act(()=>device.assign(l,p,binding));}
 function renderChoices(){
  const host=$('choices');host.replaceChildren();host.className='zmk-choices';if(!device.map)return;
  const query=$('search').value.trim().toLowerCase(),kp=keypressBehavior(device.behaviors);
  for(const b of $('categories').children)b.classList.toggle('selected',b.dataset.category===category);
  if(category==='布局设置'&&!query){
   host.classList.add('zmk-layouts');host.append(el('h3','','布局设置'));
   if(device.physical.layouts.length===1){const name=device.physical.layouts[0].name||'Default';host.append(el('p','zmk-current-layout','当前布局：'+name),el('p','muted','这块 PCB 的固件只提供一个布局，无需切换。'));return;}
   host.append(el('p','muted','选择当前固件支持的布局，切换后立即生效并自动保存。'));
   const select=el('select');select.setAttribute('aria-label','选择物理布局');device.physical.layouts.forEach((l,i)=>{const o=el('option','',l.name);o.value=i;select.append(o);});select.value=device.physical.activeLayoutIndex;select.disabled=device.preexistingDirty;
   select.onchange=()=>act(()=>device.selectLayout(Number(select.value)));host.append(select,el('p','muted','未列出的 ANSI、ISO 或底排组合需要该型号的多布局固件。'));return;
  }
  if(mode==='basic'&&category==='基础按键'&&!query&&kp){
   host.classList.add('physical-picker');const keyboard=el('div','zmk-palette');keyboard.style.aspectRatio=`${TKL_MM.width} / ${TKL_MM.height}`;
   for(const k of TKL_KEYS){const binding={behaviorId:kp.id,param1:(7<<16)|k.code,param2:0};const b=button(label(k.code),()=>assign(binding),'keycap');b.style.cssText=keycapStyle(k,TKL_MM);b.disabled=!validBinding(binding,device.behaviors,device.map.layers)||device.preexistingDirty;b.classList.toggle('modifier',usesModifierColor(k.code,k.w));keyboard.append(b);}host.append(keyboard);const extra=el('div','zmk-simple-extras');for(const behavior of device.behaviors.filter(b=>['transparent','none'].includes(behaviorHelp(b).kind))){const help=behaviorHelp(behavior);const b=button(help.title,()=>renderBehavior(behavior),'outline');b.title=help.description;extra.append(b);}host.append(extra);return;
  }
  if(mode==='basic'&&category==='数字小键盘'&&!query&&kp){
   host.classList.add('physical-picker');const pad=el('div','numpad-board zmk-numpad');pad.setAttribute('role','group');pad.setAttribute('aria-label','数字小键盘');
   const current=device.map.layers.find(l=>l.id===layerId).bindings[position];
   for(const [code,x,y,w=1,h=1]of ZMK_NUMPAD){const binding={behaviorId:kp.id,param1:(7<<16)|code,param2:0};const b=button(label(code).replace(/^KP /,''),()=>assign(binding));b.dataset.usage=String(code);b.title=label(code);b.setAttribute('aria-label',label(code));b.style.gridColumn=`${x+1} / span ${w}`;b.style.gridRow=`${y+1} / span ${h}`;b.disabled=!validBinding(binding,device.behaviors,device.map.layers)||device.preexistingDirty;b.classList.toggle('selected',current.behaviorId===kp.id&&current.param1===binding.param1&&current.param2===0);pad.append(b);}host.append(pad);return;
  }
  if(mode==='basic'&&['基础按键','数字小键盘','媒体控制'].includes(category)){
   if(!kp){host.append(el('p','','此固件未提供标准 Key Press 功能，请使用高级功能选择。'));return;}
   const media=ZMK_MEDIA;
   const items=category==='媒体控制'?media.map(([name,usage])=>({name,value:(12<<16)|usage})):ZMK_KEYS.filter(k=>k.code>=4&&k.code<=231&&(category!=='数字小键盘'||k.code>=83&&k.code<=99)).map(k=>({name:label(k.code),value:(7<<16)|k.code,title:k.title}));
   for(const item of items){if(query&&!`${item.name} ${item.title||''}`.toLowerCase().includes(query))continue;const binding={behaviorId:kp.id,param1:item.value,param2:0};if(validBinding(binding,device.behaviors,device.map.layers))host.append(button(item.name,()=>assign(binding),'outline'));}return;
  }
  const behaviors=device.behaviors.filter(b=>!b.displayName.startsWith('zmk_reserved_')).filter(b=>{const h=behaviorHelp(b);return query?[b.displayName,h.title,h.description,translate(h.title),translate(h.description)].join(' ').toLowerCase().includes(query):behaviorInCategory(b,category);});
  host.classList.add('zmk-behaviors');
  for(const behavior of behaviors){const h=behaviorHelp(behavior),b=button('',()=>renderBehavior(behavior),'zmk-behavior-card');b.append(el('strong','',h.title),el('code','',behavior.displayName),el('span','',h.description));b.title=h.example;host.append(b);}
  if(!behaviors.length)host.append(el('p','muted','当前固件没有提供此类功能。'));
 }
 function renderBehavior(behavior){
  const host=$('choices'),help=behaviorHelp(behavior);host.replaceChildren();host.className='zmk-choices zmk-builder';
  host.append(button('返回功能列表',renderChoices,'text-button'),el('h3','',help.title),el('code','zmk-native-name',behavior.displayName),el('p','',help.description));
  const example=el('div','zmk-example');example.append(el('strong','','使用示例'),el('p','',help.example));host.append(example);if(help.note)host.append(el('p','zmk-behavior-note',help.note));
  const metadata=behavior.metadata.length?behavior.metadata:[{param1:[],param2:[]}];
  const variants=el('select');variants.setAttribute('aria-label','功能参数组合');metadata.forEach((m,i)=>{const o=el('option','',m.param1.map(d=>d.name).filter(Boolean).join(' / ')||`参数组合 ${i+1}`);o.value=i;variants.append(o);});if(metadata.length>1)host.append(variants);
  const form=el('div','zmk-params');host.append(form);let values=[0,0];
  function field(descriptions,index){
   const wrap=el('label'),title=el('span','',help.params[index]||'参数 '+(index+1));wrap.append(title);const options=[];let numeric=null,hasHid=false;
   for(const d of descriptions){if(d.nil!==undefined)options.push({value:0,name:'无'});if(d.constant!==undefined)options.push({value:d.constant,name:d.name||String(d.constant)});if(d.layerId!==undefined)device.map.layers.forEach(l=>options.push({value:l.id,name:l.name||String(l.id)}));if(d.hidUsage){hasHid=true;ZMK_KEYS.filter(k=>k.code>=4&&k.code<=Math.min(231,d.hidUsage.keyboardMax)).forEach(k=>options.push({value:(7<<16)|k.code,name:label(k.code)}));ZMK_MEDIA.filter(([,usage])=>usage<=d.hidUsage.consumerMax).forEach(([name,usage])=>options.push({value:(12<<16)|usage,name}));}if(d.range)numeric=d.range;}
   if(!descriptions.length)options.push({value:0,name:'无'});
   const select=el('select');for(const o of options){const n=el('option','',o.name);n.value=o.value;select.append(n);}
   const input=el('input');input.type='text';input.inputMode='numeric';input.setAttribute('aria-label','自定义参数值');input.placeholder='0 / 0x70004';
   if(numeric||hasHid){const o=el('option','','自定义参数值');o.value='custom';select.append(o);}
   select.value=options.length?String(options[0].value):'custom';input.value=String(numeric?.min??0);input.hidden=select.value!=='custom';
   const modifiers=el('div','zmk-modifiers');
   if(hasHid)Array.from({length:8},(_,i)=>{const item=el('label'),box=el('input');box.type='checkbox';box.dataset.modifier=i;item.append(box,el('span','',label(224+i)));modifiers.append(item);box.onchange=()=>change();});
   const change=()=>{input.hidden=select.value!=='custom';modifiers.hidden=select.value==='custom';const raw=input.value.trim();const base=Number(select.value),mask=Array.from(modifiers.querySelectorAll('input:checked')).reduce((m,b)=>m|(1<<Number(b.dataset.modifier)),0);values[index]=select.value==='custom'?(raw?Number(raw):NaN):((base|(mask<<24))>>>0);update();};
   select.onchange=change;input.oninput=change;values[index]=options[0]?.value??numeric?.min??0;
   const current=device.map.layers.find(l=>l.id===layerId).bindings[position],existing=current.behaviorId===behavior.id?current['param'+(index+1)]:null;
   const preferred=existing??(hasHid?(7<<16)|(help.kind==='mt'&&index===0?224:4):values[index]);
   if(options.some(o=>o.value===(hasHid?preferred&0xffffff:preferred))){select.value=String(hasHid?preferred&0xffffff:preferred);for(const box of modifiers.querySelectorAll('input'))box.checked=!!((preferred>>>24)&(1<<Number(box.dataset.modifier)));values[index]=preferred;}
   else if(existing!==null&&(numeric||hasHid)){select.value='custom';input.value=String(existing);input.hidden=false;modifiers.hidden=true;values[index]=existing;}
   wrap.append(select,input);if(hasHid)wrap.append(modifiers);if(descriptions.length===0||descriptions.every(d=>d.nil!==undefined))wrap.hidden=true;
   form.append(wrap);
  }
  const preview=el('div','zmk-binding-preview');host.append(preview);
  const use=button('应用到选中按键',()=>assign({behaviorId:behavior.id,param1:values[0],param2:values[1]}),'primary');host.append(use);
  function update(){const m=metadata[Number(variants.value)||0];preview.textContent=values.map((n,i)=>{const desc=m?.['param'+(i+1)]||[];if(!desc.length||desc.every(d=>d.nil!==undefined))return '';let text=String(n);if(desc.some(d=>d.hidUsage)){const usage=n&65535,page=(n>>>16)&255;const key=page===7?label(usage):ZMK_MEDIA.find(([,u])=>u===usage)?.[0]||'0x'+n.toString(16);text=[...Array.from({length:8},(_,j)=>j).filter(j=>(n>>>24)&(1<<j)).map(j=>label(224+j)),key].join('+');}else if(desc.some(d=>d.layerId!==undefined))text=device.map.layers.find(l=>l.id===n)?.name||String(n);else text=desc.find(d=>d.constant===n)?.name||text;return (help.params[i]||'参数 '+(i+1))+'：'+text;}).filter(Boolean).join(' · ')||'无需参数';use.disabled=device.preexistingDirty||!validBinding({behaviorId:behavior.id,param1:values[0],param2:values[1]},device.behaviors,device.map.layers);}
  function fields(){form.replaceChildren();const m=metadata[Number(variants.value)||0];if(!m){use.disabled=true;return;}field(m.param1,0);field(m.param2,1);update();}variants.onchange=fields;fields();
 }
 $('basic').onclick=()=>{mode='basic';category='基础按键';render();};$('advanced').onclick=()=>{mode='advanced';category='输入与组合';render();};$('search').oninput=renderChoices;
 $('undo').onclick=()=>act(()=>device.undo());$('reload').onclick=()=>act(()=>device.reload());$('retry').onclick=()=>act(()=>device.flush());
 $('export').onclick=()=>{if(!device?.map)return;const content={format:'zmk-studio-keymap-v1',name:device.profile.name,physical:device.physical,keymap:device.map,behaviors:device.behaviors,exported:new Date().toISOString()},url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='zmk-keymap.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 window.addEventListener('beforeunload',e=>{if(device?.dirty||device?.queued){e.preventDefault();e.returnValue='';}});
 return {refresh,load(){device=getDevice();layerId=device.map?.layers[0]?.id??0;position=0;mode='basic';category='基础按键';render();}};
}
