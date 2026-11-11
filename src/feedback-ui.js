import {diagnosticSnapshot} from './diagnostics.js';
import {translate as t} from './i18n-core.js';
export function setupFeedback({getModel}){
 const $=id=>document.getElementById(id),dialog=$('feedback-dialog'),form=$('feedback-form');let screenshots=[],pending=false,snapshot=null,requestId=null;
 const endpoint=['v.kbd.cool','www.kbd.cool'].includes(location.hostname)?'https://kbd.cool/studio/api/feedback':import.meta.env.DEV?'/studio/api/feedback':`${import.meta.env.BASE_URL}api/feedback`;
 function resetRequest(){requestId=null;}
 function lock(value){pending=value;form.querySelectorAll("input,select,textarea,button").forEach(el=>el.disabled=value);}
 function renderImages(){const area=$('feedback-previews');area.replaceChildren();screenshots.forEach((data,i)=>{const item=document.createElement('div'),img=document.createElement('img'),remove=document.createElement('button');item.className='feedback-thumb';img.src=data;img.alt=t('截图')+' '+(i+1);remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',t('移除截图'));remove.onclick=()=>{if(pending)return;screenshots.splice(i,1);resetRequest();renderImages();};item.append(img,remove);area.append(item);});$('feedback-count').textContent=`${screenshots.length} / 3`;}
 function open(){if(pending)return;const model=getModel();if(model&&['athena75','athena1800'].includes(model))$('feedback-model').value=model;$('feedback-other-wrap').hidden=$('feedback-model').value!=='other';$('feedback-other').required=!$('feedback-other-wrap').hidden;snapshot=diagnosticSnapshot();$('feedback-log').textContent=JSON.stringify(snapshot,null,2);$('feedback-result').hidden=true;form.hidden=false;$('feedback-error').textContent='';dialog.showModal();}
 document.querySelectorAll('[data-open-feedback]').forEach(b=>b.addEventListener('click',open));
 document.querySelectorAll('[data-close-feedback]').forEach(b=>b.onclick=()=>{if(!pending)dialog.close();});dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 form.addEventListener('input',resetRequest);
 $('feedback-model').onchange=()=>{$('feedback-other-wrap').hidden=$('feedback-model').value!=='other';$('feedback-other').required=!$('feedback-other-wrap').hidden;};
 $('feedback-files').onchange=async()=>{
  if(pending)return;
  const files=[...$('feedback-files').files];$('feedback-files').value='';$('feedback-error').textContent='';if(files.length+screenshots.length>3){$('feedback-error').textContent=t('最多添加 3 张截图。');return;}
  lock(true);
  try{for(const file of files){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('IMAGE');
   const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('IMAGE');}
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let data=canvas.toDataURL('image/jpeg',0.8);if(data.length>1398104)data=canvas.toDataURL('image/jpeg',0.55);if(data.length>1398104)throw Error('IMAGE');screenshots.push(data);
  }resetRequest();renderImages();}catch{$('feedback-error').textContent=t('请选择不超过 12 MB 的 PNG、JPG 或 WebP 图片。');renderImages();}finally{lock(false);}
 };
 form.onsubmit=async e=>{
  e.preventDefault();if(pending||!form.reportValidity())return;lock(true);requestId||=crypto.randomUUID();$('feedback-submit').disabled=true;$('feedback-submit').textContent=t('正在提交…');$('feedback-error').textContent='';
  const body={requestId,model:$('feedback-model').value,modelName:$('feedback-other').value,description:$('feedback-description').value,screenshots:[...screenshots],diagnostics:$('feedback-logs').checked?snapshot:null};
  try{const r=await fetch(endpoint,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok||!result.ok){if(r.status===429)throw Error('RATE_LIMIT');throw Error('SUBMIT');}
   form.hidden=true;$('feedback-result').hidden=false;$('feedback-ticket').textContent=result.id;$('feedback-result').focus();form.reset();screenshots=[];renderImages();requestId=null;
  }catch(e){$('feedback-error').textContent=t(e.message==='RATE_LIMIT'?'提交较频繁，请稍后再试。':'提交失败，内容已保留，请检查网络后重试。');}
  finally{lock(false);$('feedback-submit').textContent=t('提交反馈');}
 };
}
