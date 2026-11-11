import {createBootloaderMonitor} from './bootloader-monitor.js';
import {bootloaderGuide} from './bootloader-guide.js';
import {Picoboot} from './device.js';
import {planFirmwareUpgrade,recoveryUf2} from './firmware-plan.js';
import {readFirmwareFlash,writeFirmwarePlan} from './firmware-transport.js';
import {saveFirmwareBackup} from './firmware-backup.js';
import {digest} from './backup-v2.js';

export function setupFirmwareUpgrade({getIdentity,getBusy,releaseConnection,onFinished,onStateChange}) {
  const dialog=document.createElement('dialog');dialog.id='firmware-dialog';
  dialog.setAttribute('aria-labelledby','firmware-title');
  // Retain the guide across the intentional USB disconnect. Other workspaces close.
  dialog.dataset.connectionIndependent='true';
  dialog.innerHTML=`<button type="button" class="dialog-close" id="upgrade-close" aria-label="关闭">×</button>
    <div class="eyebrow">ATHENA · FIRMWARE</div><h2 id="firmware-title">按住 Esc，再连接键盘。</h2>
    <span class="upgrade-model" id="upgrade-model"></span>
    <p class="upgrade-subtitle" id="upgrade-intro">先识别键盘型号，再按下图进入刷机模式。</p>
    <div id="upgrade-guide">${bootloaderGuide()}</div>
    <div id="upgrade-detection" class="upgrade-detection" role="status" aria-live="polite"><span id="upgrade-detection-text"></span><button type="button" id="upgrade-detect" class="outline small">检测 / 授权升级设备</button></div>
    <label class="upgrade-reset-choice"><input id="upgrade-clear-confirm" type="checkbox"><span><strong>我确认：升级将清除全部图片和动画</strong><small>升级后提供 3 个空白图片位置，需要重新上传。键位配置保留；恢复备份会保存在此浏览器。</small></span></label>
    <progress id="upgrade-progress" max="100" value="0" hidden></progress>
    <p id="upgrade-status" role="status" aria-live="polite"></p><p id="upgrade-error" class="error" role="alert"></p>
    <div class="upgrade-footer"><button type="button" class="upgrade-download" id="upgrade-recovery" hidden>下载恢复文件</button><button type="button" class="outline" id="upgrade-back">返回</button><button type="button" class="primary" id="upgrade-start" disabled>开始升级</button></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  let identity=null,release=null,uf2=null,running=false,backup=null,boot=null,generation=0,detecting=false,done=false,deviceState={kind:'waiting',device:null};
  const monitor=createBootloaderMonitor({onChange:value=>{deviceState=value;renderDetection();}});
  function renderDetection(){
    if(running||done)return;
    const ready=deviceState.kind==='ready';
    $('upgrade-detection').classList.toggle('ready',ready);
    $('upgrade-detection-text').textContent=ready
      ? !identity?'已检测到 RPI-RP2。仍需先在正常模式识别键盘型号。':release?'已进入 RPI-RP2，设备已准备好，可以开始升级。':'已进入 RPI-RP2，正在等待此型号的可用升级包。'
      : deviceState.kind==='multiple'?'发现多个 RP2 Boot，请选择要升级的那一把键盘。'
      : deviceState.kind==='unsupported'?'此浏览器不支持升级设备检测，请使用桌面版 Chrome 或 Edge。'
      : deviceState.kind==='unavailable'?'暂时无法检测设备，请点击授权后重试。'
      :'等待 RPI-RP2。按住 Esc 插入 USB；首次使用请点击检测 / 授权。';
    $('upgrade-detect').disabled=detecting||!navigator.usb;
    $('upgrade-detect').textContent=ready?'重新选择设备':'检测 / 授权升级设备';
    $('upgrade-start').disabled=!ready||!identity||!release||detecting||!$('upgrade-clear-confirm').checked;
  }
  $('upgrade-clear-confirm').onchange=()=>renderDetection();
  function stopWaiting(){monitor.stop();onStateChange?.();}
  $('upgrade-detect').onclick=async()=>{
    if(running||done||detecting)return;detecting=true;renderDetection();$('upgrade-error').textContent='';
    try{await monitor.choose();}catch(e){if(e.name==='NotFoundError')$('upgrade-status').textContent='尚未选择升级设备，可以重试。';else $('upgrade-error').textContent='无法连接升级设备，请确认已按住 Esc 插线，并选择 RP2 Boot。';}
    finally{detecting=false;renderDetection();}
  };
  function lock(value){running=value;dialog.setAttribute('aria-busy',String(value));$('upgrade-close').disabled=$('upgrade-back').disabled=value;$('upgrade-start').disabled=value;$('upgrade-detect').disabled=value;$('upgrade-clear-confirm').disabled=value;if(!value)renderDetection();}
  function status(label,pct){$('upgrade-status').textContent=label;$('upgrade-progress').hidden=false;$('upgrade-progress').value=pct;}
  function close(){if(!running){generation++;dialog.close();stopWaiting();}}
  $('upgrade-close').onclick=$('upgrade-back').onclick=close;
  // Esc is used to enter the keyboard bootloader, so it must never dismiss this guide.
  dialog.addEventListener('cancel',e=>e.preventDefault());
  dialog.addEventListener('close',()=>{monitor.stop();onStateChange?.();});
  window.addEventListener('beforeunload',e=>{if(running){e.preventDefault();e.returnValue='';}});
  $('upgrade-recovery').onclick=()=>{
    if(!backup)return;const url=URL.createObjectURL(new Blob([recoveryUf2(backup.data)]));const a=document.createElement('a');a.href=url;a.download=`${backup.model}-recovery-${backup.id}.uf2`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  async function open(){
    if(getBusy()||running)return;
    identity=getIdentity();release=null;uf2=null;backup=null;done=false;detecting=false;deviceState={kind:'waiting',device:null};const ticket=++generation;
    $('upgrade-model').textContent=identity?.profile?.name||'Athena';
    $('upgrade-clear-confirm').checked=false;$('upgrade-error').textContent='';$('upgrade-status').textContent='';$('upgrade-guide').hidden=false;$('upgrade-progress').hidden=true;$('upgrade-recovery').hidden=true;
    $('upgrade-start').textContent='开始升级';$('upgrade-detection').hidden=false;$('upgrade-start').hidden=false;lock(false);
    $('upgrade-intro').textContent='先识别键盘型号，再按下图进入刷机模式。';
    if(!dialog.open)dialog.showModal();
    onStateChange?.();void monitor.start();
    if(!identity){$('upgrade-status').textContent='请先在正常打字模式连接键盘，以确认升级型号。';return;}
    if(!navigator.usb){$('upgrade-status').textContent='在线升级需要桌面版 Chrome 或 Edge。';return;}
    try{
      const manifestUrl=import.meta.env.DEV?'/__firmware-test/releases.json':`${import.meta.env.BASE_URL}firmware/releases.json`;
      const response=await fetch(manifestUrl,{cache:'no-store'});
      if(!response.ok)throw Error('此型号的在线升级包正在验证，暂未开放写入。可以先查看操作图示。');
      const manifest=await response.json();if(ticket!==generation)return;
      if(manifest.schema!==1||!Array.isArray(manifest.releases))throw Error('升级信息格式不正确');
      const selected=manifest.releases.find(r=>r.model===identity.profile.id&&r.pid===identity.profile.pid);
      if(!selected)throw Error('此型号的在线升级包正在验证，暂未开放写入。可以先查看操作图示。');
      const url=new URL(selected.url,new URL(import.meta.env.BASE_URL,location.href));
      if(url.origin!==location.origin)throw Error('固件必须来自当前站点');
      const file=await fetch(url,{cache:'no-store'});if(!file.ok)throw Error('固件下载失败，请重试');
      const bytes=new Uint8Array(await file.arrayBuffer());if(ticket!==generation)return;
      if(await digest(bytes)!==selected.sha256)throw Error('固件下载校验失败');
      if(ticket!==generation)return;
      release=selected;uf2=bytes;
      $('upgrade-intro').textContent='拔插时会保留当前型号和升级步骤。进入 RPI-RP2 后点击开始升级，网页会备份、写入、校验并重启。';
      $('upgrade-status').textContent='本次升级会清除全部旧图片和动画，不迁移旧素材。请确认下方提示后开始。';
      lock(false);
    }catch(e){if(ticket===generation)$('upgrade-error').textContent=e.message;}
  }
  $('upgrade-start').onclick=async()=>{
    if(running||!release||!identity||!monitor.getDevice()||!$('upgrade-clear-confirm').checked)return;
    lock(true);$('upgrade-error').textContent='';
    try{
      // Only this explicit action claims the selected interface and starts reads.
      const selectedDevice=monitor.getDevice();monitor.stop();
      boot=await Picoboot.connect({device:selectedDevice});
      await releaseConnection();
      $('upgrade-guide').hidden=true;
      const flash=await readFirmwareFlash(boot,p=>status('读取键盘，检查升级条件…',p*25));
      status('核对型号与清空范围…',25);
      const plan=await planFirmwareUpgrade(flash,uf2,release,identity.profile,{clearImages:true});
      status('保存完整恢复备份…',28);
      backup=await saveFirmwareBackup(flash,plan,boot.device.serialNumber||'');$('upgrade-recovery').hidden=false;
      if(plan.sectors.length){
        await writeFirmwarePlan(boot,plan,backup.id,(stage,p)=>status(`${stage}…`,stage==='确认设备'?30+p*15:stage==='写入固件'?45+p*35:80+p*19));
      }else{
        const again=await readFirmwareFlash(boot,p=>status('当前已是此版本，正在回读校验…',30+p*69));
        if(await digest(again)!==plan.targetSha256)throw Error('完整回读校验失败');
      }
      await boot.reboot();boot=null;done=true;$('upgrade-detection').hidden=true;
      status('升级与校验完成，图片已清空，键盘已重启。重新连接后上传新图片，或启用电子宠物。',100);
      $('upgrade-start').hidden=true;
      onFinished?.();
    }catch(e){
      if(e.name==='NotFoundError')$('upgrade-status').textContent='尚未选择升级设备，可以重试。';
      else $('upgrade-error').textContent=e.message;
      await boot?.close().catch(()=>{});boot=null;
      // After a partial write, never blindly replan from damaged contents.
      if(backup){release=null;$('upgrade-error').textContent+='\n如升级中断，请下载恢复文件，在 RPI-RP2 中拖入恢复后再重试。';}
    }finally{lock(false);if(!done&&!backup&&dialog.open)void monitor.start();}
  };
  return {open,isRunning:()=>running,isOpenForUpgrade:()=>dialog.open&&!!identity};
}
