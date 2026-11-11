import {TYPING_DEFAULTS,normalizeTypingSettings,encodeTypingSettings} from './typing-settings.js';
const STORAGE='athena-typing-settings-v1';
export function setupTypingSettings({preview,getDevice,getBusy,setBusy}){
 const $=id=>document.getElementById(id),box=$('typing-settings'),hint=$('typing-settings-status');
 let draft=normalizeTypingSettings(TYPING_DEFAULTS),loaded=null,current=null,status=null,lastStatus=null,timer=0,loading=false,saving=false,savePending=false,revision=0;
 try{const saved=localStorage.getItem(STORAGE);if(saved)draft=normalizeTypingSettings(JSON.parse(saved));}catch{}
 function remember(){try{localStorage.setItem(STORAGE,JSON.stringify(draft));}catch{}}
 function render(){
  $('typing-size').value=String(draft.size);$('typing-weight').value=String(draft.weight);$('typing-color-mode').value=String(draft.mode);
  const labels=draft.mode===0?['统一颜色']:draft.mode===2?['字母','数字','符号']:['颜色 1','颜色 2','颜色 3','颜色 4'];
  draft.colors.forEach((c,i)=>{const input=$('typing-color-'+i);input.value=c;input.parentElement.hidden=i>=labels.length;input.parentElement.querySelector('span').textContent=labels[i]||'';input.setAttribute('aria-label',labels[i]||'备用颜色');});
  $('typing-background').value=draft.background;$('typing-grid').value=draft.grid;
  preview.setSettings(draft);
 }
 function disabled(){for(const e of box.querySelectorAll('input,select,button'))e.disabled=loading||getBusy();}
 function offlineMessage(){hint.textContent=current?(status?.motionVersion>=8?'预览即时更新，连接后自动生效并保存。':'当前固件不支持外观设置，升级后才会在键盘生效。'):'仅本地预览 · 连接后读取键盘实际设置';}
 async function load(d){
  loading=true;loaded=d;disabled();setBusy(true);hint.textContent='正在读取键盘设置…';
  try{const result=await d.typingSettings();if(getDevice()!==d)return;draft=result.settings;revision++;savePending=result.dirty;render();remember();hint.textContent=result.saveError?'键盘存档失败，请重试。':result.dirty?'设置已读取，等待键盘保存…':'已读取键盘设置 · 修改后自动生效';}
  catch(e){if(getDevice()===d)hint.textContent='读取失败：'+e.message;}
  finally{loading=false;setBusy(false);disabled();}
 }
 async function apply(){
  clearTimeout(timer);timer=0;const d=getDevice();
  if(!d||d!==current||d!==loaded||status?.motionVersion<8){offlineMessage();return;}
  if(getBusy()||loading){timer=setTimeout(apply,250);return;}
  const version=revision,snapshot=normalizeTypingSettings(draft);saving=true;setBusy(true);disabled();hint.textContent='正在应用到键盘…';
  try{
   await d.typingSettings(snapshot);const result=await d.typingSettings();
   if(getDevice()!==d)return;
   if(encodeTypingSettings(snapshot).some((v,i)=>v!==encodeTypingSettings(result.settings)[i]))throw Error('设置回读不一致');
   if(version===revision){draft=result.settings;render();remember();}
   savePending=result.dirty;hint.textContent=result.saveError?'已应用，但存档失败，请重试。':result.dirty?'已生效 · 正在保存到键盘…':'已生效并保存到键盘';
  }catch(e){if(getDevice()===d)hint.textContent='未确认应用成功：'+e.message;}
  finally{saving=false;setBusy(false);disabled();}
 }
 function edited(commit=true){
  clearTimeout(timer);timer=0;
  draft=normalizeTypingSettings({size:Number($('typing-size').value),weight:Number($('typing-weight').value),mode:Number($('typing-color-mode').value),colors:Array.from({length:4},(_,i)=>$('typing-color-'+i).value),background:$('typing-background').value,grid:$('typing-grid').value});revision++;render();remember();
  if(commit){clearTimeout(timer);if(current&&loaded===current&&status?.motionVersion>=8){hint.textContent='预览已更新 · 等待应用…';timer=setTimeout(apply,350);}else offlineMessage();}
 }
 for(const id of ['typing-size','typing-weight','typing-color-mode'])$(id).onchange=()=>edited();
 for(let i=0;i<4;i++){const input=$('typing-color-'+i);input.oninput=()=>edited(false);input.onchange=()=>edited();}
 for(const id of ['typing-background','typing-grid']){const input=$(id);input.oninput=()=>edited(false);input.onchange=()=>edited();}
 $('typing-settings-reset').onclick=()=>{draft=normalizeTypingSettings(TYPING_DEFAULTS);render();edited();};
 render();
 return {refresh(d,s){
  const connected=!!(d&&!d.broken&&d.device.opened);if(!connected)d=null;
  if(d!==current){current=d;loaded=null;savePending=false;loading=false;revision++;clearTimeout(timer);timer=0;}
  status=s;disabled();
  if(d&&s?.motionVersion>=8&&loaded!==d&&!getBusy()){void load(d);return;}
  if(s&&s!==lastStatus&&!loading&&!saving&&!timer&&savePending){hint.textContent=s.saveError?'键盘存档失败，请重试。':s.dirty?'已生效 · 正在保存到键盘…':'已生效并保存到键盘';if(!s.dirty&&!s.saveError)savePending=false;}
  lastStatus=s;
  if(!loading&&!saving&&!timer&&!savePending&&(!d||s?.motionVersion<8))offlineMessage();
 }};
}
