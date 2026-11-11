import {bootloaderGuide} from './bootloader-guide.js';
import {Picoboot} from './device.js';
import {planFirmwareUpgrade,recoveryUf2} from './firmware-plan.js';
import {readFirmwareFlash,writeFirmwarePlan} from './firmware-transport.js';
import {saveFirmwareBackup} from './firmware-backup.js';
import {digest} from './backup-v2.js';
import './firmware-upgrade.css';

export function setupFirmwareUpgrade({getIdentity,getBusy,releaseConnection,onFinished}) {
  const dialog=document.createElement('dialog');dialog.id='firmware-dialog';
  dialog.setAttribute('aria-labelledby','firmware-title');
  // Retain the guide across the intentional USB disconnect. Other workspaces close.
  dialog.dataset.connectionIndependent='true';
  dialog.innerHTML=`<button type="button" class="dialog-close" id="upgrade-close" aria-label="关闭">×</button>
    <div class="eyebrow">ATHENA · FIRMWARE</div><h2 id="firmware-title">按住 Esc，再连接键盘。</h2>
    <span class="upgrade-model" id="upgrade-model"></span>
    <p class="upgrade-subtitle" id="upgrade-intro">先识别键盘型号，再按下图进入刷机模式。</p>
    <div id="upgrade-guide">${bootloaderGuide()}</div>
    <progress id="upgrade-progress" max="100" value="0" hidden></progress>
    <p id="upgrade-status" role="status" aria-live="polite"></p><p id="upgrade-error" class="error" role="alert"></p>
    <div class="upgrade-footer"><button type="button" class="upgrade-download" id="upgrade-recovery" hidden>下载恢复文件</button><button type="button" class="outline" id="upgrade-back">返回</button><button type="button" class="primary" id="upgrade-start" disabled>选择设备并升级</button></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  let identity=null,release=null,uf2=null,running=false,backup=null,boot=null,generation=0;
  function lock(value){running=value;dialog.setAttribute('aria-busy',String(value));$('upgrade-close').disabled=$('upgrade-back').disabled=value;$('upgrade-start').disabled=value||!release;}
  function status(label,pct){$('upgrade-status').textContent=label;$('upgrade-progress').hidden=false;$('upgrade-progress').value=pct;}
  function close(){if(!running){generation++;dialog.close();}}
  $('upgrade-close').onclick=$('upgrade-back').onclick=close;
  dialog.addEventListener('cancel',e=>{if(running)e.preventDefault();else generation++;});
  window.addEventListener('beforeunload',e=>{if(running){e.preventDefault();e.returnValue='';}});
  $('upgrade-recovery').onclick=()=>{
    if(!backup)return;const url=URL.createObjectURL(new Blob([recoveryUf2(backup.data)]));const a=document.createElement('a');a.href=url;a.download=`${backup.model}-recovery-${backup.id}.uf2`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  async function open(){
    if(getBusy()||running)return;
    identity=getIdentity();release=null;uf2=null;backup=null;const ticket=++generation;
    $('upgrade-model').textContent=identity?.profile?.name||'Athena';
    $('upgrade-error').textContent='';$('upgrade-status').textContent='';$('upgrade-guide').hidden=false;$('upgrade-progress').hidden=true;$('upgrade-recovery').hidden=true;
    $('upgrade-start').textContent='选择设备并升级';$('upgrade-start').hidden=false;lock(false);
    $('upgrade-intro').textContent='先识别键盘型号，再按下图进入刷机模式。';
    if(!dialog.open)dialog.showModal();
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
      $('upgrade-intro').textContent='使用刚刚识别的这把键盘。进入升级模式后，选择 RP2 Boot，网页会自动备份、写入、校验并重启。';
      $('upgrade-status').textContent='旧版升级保留前三组日常动画；其余动画保存在恢复文件中。已有新版会保留图片、键位和宠物数据。';
      lock(false);
    }catch(e){if(ticket===generation)$('upgrade-error').textContent=e.message;}
  }
  $('upgrade-start').onclick=async()=>{
    if(running||!release||!identity)return;
    lock(true);$('upgrade-error').textContent='';
    try{
      // requestDevice starts inside the click; no network await loses activation.
      boot=await Picoboot.connect();
      await releaseConnection();
      $('upgrade-guide').hidden=true;
      const flash=await readFirmwareFlash(boot,p=>status('读取键盘，检查升级条件…',p*25));
      status('核对型号与动画布局…',25);
      const plan=await planFirmwareUpgrade(flash,uf2,release,identity.profile);
      status('保存完整恢复备份…',28);
      backup=await saveFirmwareBackup(flash,plan,boot.device.serialNumber||'');$('upgrade-recovery').hidden=false;
      if(plan.sectors.length){
        await writeFirmwarePlan(boot,plan,backup.id,(stage,p)=>status(`${stage}…`,stage==='确认设备'?30+p*15:stage==='写入固件'?45+p*35:80+p*19));
      }else{
        const again=await readFirmwareFlash(boot,p=>status('当前已是此版本，正在回读校验…',30+p*69));
        if(await digest(again)!==plan.targetSha256)throw Error('完整回读校验失败');
      }
      await boot.reboot();boot=null;
      status(plan.sectors.length?'升级完成，键盘已重启。重新连接即可使用。':'已是此版本，备份与完整回读校验通过，未重复刷写。键盘已重启。',100);
      $('upgrade-start').hidden=true;
      onFinished?.();
    }catch(e){
      if(e.name==='NotFoundError')$('upgrade-status').textContent='尚未选择升级设备，可以重试。';
      else $('upgrade-error').textContent=e.message;
      await boot?.close().catch(()=>{});boot=null;
      // After a partial write, never blindly replan from damaged contents.
      if(backup){release=null;$('upgrade-error').textContent+='\n如升级中断，请下载恢复文件，在 RPI-RP2 中拖入恢复后再重试。';}
    }finally{lock(false);}
  };
  return {open,isRunning:()=>running};
}
