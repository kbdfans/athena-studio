import {PetGroundMotion} from './pet-scene.js';
import {setupTypingSettings} from './typing-settings-ui.js';
import {setupTypingPreview} from './typing-preview.js';
import {setupPetColors} from './pet-color-ui.js';
import {playStoredImage} from "./image-playback.js";
import {createPetPack,validatePetPack,PET_ACTIONS,PET_SPECIES,PET_BYTES,isPet40} from './pet-pack.js';
import {petPreview,PetMotion} from './pet-preview.js';
import {listBackups} from './backup-v2.js';
const $=id=>document.getElementById(id);
export function setupPet({getDevice,getBusy,setBusy,notice,getImage,feedback}){
  let action=0,pack=createPetPack("mint"),status=null,connectedDevice=null,stage=2,actionAt=performance.now(),simulating=false;
  let paletteEditor;
  let installedAppearance = null;
  let appearanceCheck = 'pending';
  const sameAppearance = (a, b) => a?.length === b.length && b.every((byte, i) => byte === a[i]);

  const typingPreview=setupTypingPreview($('typing-workspace'));
  const typingEditor=setupTypingSettings({preview:typingPreview,getDevice,getBusy,setBusy});
  let motion=new PetMotion(performance.now());
  const ground=new PetGroundMotion();
  const previewCanvas = $('pet-canvas').getContext('2d');
  function refreshConnection(){
    const d=getDevice(),connected=!!(d&&!d.broken&&d.device.opened),busy=getBusy();
    if(d!==connectedDevice||!connected){
      connectedDevice=d;status=null;installedAppearance=null;appearanceCheck='pending';
    }
    $('pet-connection').textContent=connected?(status?.mode===2?'击打特效运行中':status?.mode===1?'宠物模式运行中':'已连接 · 图片模式'):'未连接 · 当前仅为动作预览';
    for(const id of ['pet-enable','pet-upload','pet-save','show-image'])$(id).disabled=!connected||busy;
    $('show-image').textContent=`播放键盘中的图片 ${getImage()+1}`;
    const upload = $('pet-upload');
    paletteEditor?.updateCompatibility(connected?d.profile?.id:undefined,status?.motionVersion);
    const canUpload = connected && status?.motionVersion >= 5 && paletteEditor?.valid && !paletteEditor.requiresUpgrade;
    const hasUpdate = canUpload && installedAppearance !== null && !sameAppearance(installedAppearance, pack);
    upload.disabled = !canUpload || busy || appearanceCheck === 'reading';
    upload.classList.toggle('has-update', !!hasUpdate);
    for(const id of ['pet-feed','pet-touch'])$(id).disabled=!connected||busy||status?.mode!==1;
    $('pet-level').textContent=status?`Lv. ${status.level}`:'—';
    $('pet-xp').textContent=status?`${status.xp}`:'—';
    $('pet-stage-status').textContent=status?.motionVersion>=2?['孵化中','幼年','成年'][status.stage]:'—';
    let appearanceHint = '连接后可更新外观，成长进度保留。';
    if (paletteEditor?.requiresUpgrade || connected && status?.motionVersion < 5) appearanceHint = '当前固件需要先升级，才能显示草地、LV / HP 和睡眠动画。';
    else if (appearanceCheck === 'reading') appearanceHint = '正在读取键盘上的宠物外观…';
    else if (appearanceCheck === 'failed') appearanceHint = '无法确认键盘上的外观，可手动更新。';
    else if (canUpload && installedAppearance !== null) {
      appearanceHint = hasUpdate ? '当前预览有新外观可写入键盘。' : '当前预览与键盘上的宠物外观一致。';
    }
    $('pet-version-hint').textContent = appearanceHint;
    $('pet-care-status').textContent=!status?'连接键盘后检查玩法版本；以下规则需要新版养成固件。':status.motionVersion>=6?'当前固件已支持以下规则，睡觉期间不扣 HP 和经验。':'当前键盘仍使用旧版玩法；升级养成固件后，以下规则才会生效。';
    typingEditor.refresh(d,status);
    $('typing-enable').disabled=!connected||busy||!status||status.motionVersion<7;
    $('typing-connection').textContent=!connected?'未连接 · 当前为本地预览':!status?'正在读取设备状态…':status.motionVersion<7?'需先升级击打特效固件':status.mode===2?'击打特效正在键盘上运行':'已连接 · 可启用击打特效';
    $('pet-fullness').textContent=status?`${status.fullness}%`:'连接后读取';
    $('pet-food-meter').style.width=`${status?.fullness||0}%`;
    $('pet-save-state').textContent=!status?'成长进度保存在键盘中。':status.saveError?'存档失败，进度暂未保存。':status.dirty?'有新进度，等待保存…':'成长进度已保存。';
  }
  async function run(fn,report=false){if(getBusy())return;setBusy(true);try{await fn();}catch(e){if(report&&feedback)feedback.fail(e.message);else notice(e.message,true);}finally{setBusy(false);refreshConnection();}}
  async function control(op,value=0){const d=getDevice();if(!d||d.broken)throw Error('请先连接 v2 键盘');status=await d.petCommand(op,value);refreshConnection();}
  $('pet-enable').onclick=()=>run(async()=>{feedback?.start({target:'电子宠物',filename:'启用键盘中已保存的宠物',buttonId:'pet-enable',kind:'activation'});await control(17,1);if(status?.mode!==1)throw Error('设备未确认进入宠物模式');feedback?.complete({title:'宠物已就位',description:'宠物模式已开启，试着打字和它互动吧。',buttonLabel:'已启用'});},true);
  $('typing-enable').onclick=()=>run(async()=>{if(!status||status.motionVersion<7)throw Error('请先升级击打特效固件');await control(17,2);if(status.mode!==2)throw Error('设备未确认打字模式');},true);
  $('show-image').onclick=()=>run(async()=>{const slot=getImage(),result=await playStoredImage(getDevice(),slot);status=result.status;refreshConnection();notice(`${result.alreadySelected?'键盘已在播放':'设备已确认播放'}图片 ${slot+1}（${result.frames} 帧）。此操作仅播放键盘内已有动画，不会上传网页预览。`);});
  $('pet-feed').onclick=()=>run(async()=>{await control(18);action=4;simulating=false;selectAction();});
  $('pet-touch').onclick=()=>run(async()=>{await control(19);action=5;simulating=false;selectAction();});
  $('pet-save').onclick=()=>run(async()=>{await control(21);notice('保存请求已发送，请等到状态显示“成长进度已保存”后再拔线。');});
  paletteEditor=setupPetColors({getBusy,onChange:()=>{pack=paletteEditor.getPack();motion.pack=pack;simulating=false;selectAction();refreshConnection();},onValidity:refreshConnection});
  pack=paletteEditor.getPack();
  function download(bytes,name){const u=URL.createObjectURL(new Blob([bytes])),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);}
  $('pet-backup').onclick=()=>run(async()=>{const b=(await listBackups(getDevice()?.profile?.id||"athena75")).find(x=>x.slot===3);if(!b)throw Error('还没有宠物外观备份；当前更新外观不再创建备份。');download(b.data,'athena-pet-backup.'+(isPet40(b.data)?'pt40':'pt32'));notice('已导出上一版宠物外观。');});
  $('pet-upload').onclick=()=>{if(!paletteEditor.valid||paletteEditor.requiresUpgrade)return;return run(async()=>{
    feedback?.start({target:'宠物外观',filename:`${PET_SPECIES[paletteEditor.species].label} · ${$('pet-theme').querySelector(':checked + span').textContent} · ${$('pet-pattern').querySelector(':checked + span').textContent}`,buttonId:'pet-upload',backup:false,kind:'pet'});
    const d=getDevice();if(!d||d.broken)throw Error('请先连接 v2 键盘');
    status=await d.petCommand();if(status.motionVersion<5)throw Error("请先升级宠物动作固件，再写入外观");
    const next=pack.slice();validatePetPack(next);
    installedAppearance = null;
    appearanceCheck = 'failed';
    feedback?.phase('write','正在写入宠物外观');await d.program(3,next,n=>{feedback?.progress(n*90);if(n>=1)feedback?.phase('verify','正在校验宠物外观');});
    feedback?.phase('verify','正在独立回读外观数据');
    const actual=await d.read(3,0x10a00000,next.length);if(!sameAppearance(actual,next))throw Error('宠物外观独立回读不一致，请重新写入');
    installedAppearance = actual;
    appearanceCheck = 'checked';
    feedback?.complete({title:'新外观已写入',description:'独立回读校验通过，成长进度保持不变。',buttonLabel:'已更新'});
  },true);};
  function selectAction(){actionAt=performance.now();Array.from($('pet-actions').children).forEach((b,i)=>{b.classList.toggle('selected',i===action);b.setAttribute('aria-pressed',String(i===action));});$('pet-preview-label').textContent=`${PET_ACTIONS[action]} · ${['孵化中','幼年','成年'][stage]}`;}
  PET_ACTIONS.forEach((name,i)=>{const b=document.createElement('button');b.textContent=name;b.onclick=()=>{if(i===6){beginInteraction();motion.key(performance.now(),true);action=motion.action;}else{action=i;simulating=false;}selectAction();};$('pet-actions').append(b);});selectAction();
  function tab(mode){if(getBusy())return;feedback?.dismiss();
    $('write').hidden=mode!=='image';$('pet-enable').hidden=mode!=='pet';$('typing-enable').hidden=mode!=='typing';
    for(const name of ['image','pet','typing']){const selected=name===mode;$(name+'-workspace').hidden=!selected;$(name+'-tab').classList.toggle('selected',selected);$(name+'-tab').setAttribute('aria-selected',String(selected));}
    $('pet-upload').hidden=mode!=='pet';
  }
  for(const name of ['image','pet','typing'])$(name+'-tab').onclick=()=>tab(name);
  async function readInstalledAppearance(device) {
    if (appearanceCheck !== 'pending' || getBusy() || status?.motionVersion < 5 ||
        $('pet-workspace').hidden || !$('screen-dialog').open) return;
    const length = status.bytes;
    appearanceCheck = 'reading';
    setBusy(true, {quiet: true});
    try {
      // Older packs have a different length and cannot match the preview.
      const bytes = length === PET_BYTES
        ? await device.read(3, 0x10a00000, PET_BYTES)
        : new Uint8Array();
      if (getDevice() !== device) return;
      installedAppearance = bytes;
      appearanceCheck = 'checked';
    } catch {
      if (getDevice() === device) appearanceCheck = 'failed';
    } finally {
      setBusy(false);
      refreshConnection();
    }
  }
  setInterval(async()=>{
    const d=getDevice();
    if(!d||d.broken||!d.device.opened||d.pending||getBusy())return;
    try {
      const nextStatus = await d.petCommand();
      if (getDevice() !== d) return;
      status = nextStatus;
      await readInstalledAppearance(d);
      refreshConnection();
    } catch(e) {
      notice(e.message,true);refreshConnection();
    }
  },1500);
  for(const b of $('pet-stages').children)b.onclick=()=>{stage=Number(b.dataset.stage);for(const c of $('pet-stages').children){c.classList.toggle('selected',c===b);c.setAttribute('aria-pressed',String(c===b));}selectAction();};
  function beginInteraction(){if(simulating)return;const now=performance.now();motion=new PetMotion(now,pack);motion.action=action<4?action:0;motion.started=actionAt;motion.activity=action===2?24:action===1?8:0;simulating=true;}
  $('pet-typing').onclick=()=>{beginInteraction();$('pet-typing-hint').textContent='开始打字，空格跳跃 · 不记录输入内容';};
  $('pet-typing').onkeydown=e=>{
    if(e.key==='Tab'||e.metaKey||e.ctrlKey||e.altKey||e.isComposing)return;
    if(e.key.length!==1&&e.key!=='Backspace'&&e.key!=='Enter')return;
    e.preventDefault();if(e.repeat)return;
    beginInteraction();
    motion.key(performance.now(),e.code==='Space');$('pet-typing-hint').textContent='正在互动 · 空格跳跃 · Tab 退出';
  };
  $('pet-typing').onblur=()=>{$('pet-typing-hint').textContent='点这里，再打字 · 空格跳跃';};
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function draw(){
    if($('pet-workspace').hidden||$('screen-settings')?.hidden||document.hidden)return;
    const now=performance.now();let elapsed=now-actionAt,jump=null;
    if(simulating){const m=motion.tick(now);if(action!==m.action){action=m.action;selectAction();}elapsed=m.elapsed;jump=m.jump;}
    const groundOffset=ground.tick(now,reduce?0:action,stage);
    const pixels=new ImageData(petPreview(pack,action,reduce?0:elapsed,stage,reduce?0:jump,status||{level:2,xp:308,fullness:80},groundOffset),128,128);
    previewCanvas.putImageData(pixels, 0, 0);

  }
  draw();setInterval(draw,50);refreshConnection();return{refreshConnection};
}
