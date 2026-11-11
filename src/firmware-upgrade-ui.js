import {firmwareVersionStatus} from './firmware-compatibility.js';
import {createBootloaderMonitor} from './bootloader-monitor.js';
import {bootloaderGuide} from './bootloader-guide.js';
import {Picoboot} from './device.js';
import {planFirmwareUpgrade,recoveryUf2} from './firmware-plan.js';
import {readFirmwareFlash,writeFirmwarePlan} from './firmware-transport.js';
import {saveFirmwareBackup} from './firmware-backup.js';
import {digest} from './backup-v2.js';

export function setupFirmwareUpgrade({getIdentity,getSnapshot,getBusy,releaseConnection,onFinished,onStateChange}) {
  const dialog=document.createElement('dialog');dialog.id='firmware-dialog';
  dialog.setAttribute('aria-labelledby','firmware-title');
  // Retain the guide across the intentional USB disconnect. Other workspaces close.
  dialog.dataset.connectionIndependent='true';
  dialog.innerHTML=`<button type="button" class="dialog-close" id="upgrade-close" aria-label="关闭">×</button>
    <div class="eyebrow">ATHENA · FIRMWARE</div><h2 id="firmware-title">按住 Esc，再连接键盘。</h2>
    <span class="upgrade-model" id="upgrade-model"></span>
    <p class="upgrade-subtitle" id="upgrade-intro">先识别键盘型号，再按下图进入刷机模式。</p>
    <p id="upgrade-version" class="upgrade-version"></p>
    <div id="upgrade-guide">${bootloaderGuide()}</div>
    <div id="upgrade-detection" class="upgrade-detection" role="status" aria-live="polite"><span id="upgrade-detection-text"></span><button type="button" id="upgrade-detect" class="primary">授权 RP2 Boot</button></div>
    <label class="upgrade-reset-choice"><input id="upgrade-clear-confirm" type="checkbox"><span><strong>我确认：升级将清除全部图片和动画</strong><small id="upgrade-preservation">升级后提供 3 个空白图片位置，需要重新上传。键位配置保留；恢复备份会保存在此浏览器。</small></span></label>
    <div id="upgrade-compatibility" class="upgrade-compatibility" hidden><h3>历史固件兼容升级</h3><p>无法确认旧配置的存储格式。可以重置为本站固件；键位、宏、布局设置、全部图片、宠物外观和成长进度都会恢复默认。恢复备份会先保存在此浏览器。</p><button type="button" id="upgrade-keymap-download" class="text-button">下载升级前键位文件</button><label><input type="checkbox" id="upgrade-reset-confirm">我确认这是原版 RP2040 / 16 MB 对应型号，并同意重置以上数据。</label></div>
    <progress id="upgrade-progress" max="100" value="0" hidden></progress>
    <p id="upgrade-status" role="status" aria-live="polite"></p><p id="upgrade-error" class="error" role="alert"></p>
    <p id="upgrade-blocker" class="upgrade-blocker" role="status" aria-live="polite"></p>
    <div class="upgrade-footer"><button type="button" class="upgrade-download" id="upgrade-recovery" hidden>下载恢复文件</button><button type="button" class="outline" id="upgrade-back">返回</button><button type="button" class="primary" id="upgrade-start" disabled>开始升级</button></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  let versionBlocked=false,snapshot=null,needsReset=false,identity=null,release=null,uf2=null,running=false,backup=null,boot=null,generation=0,detecting=false,done=false,packageState='idle',deviceState={kind:'waiting',device:null};
  const monitor=createBootloaderMonitor({onChange:value=>{deviceState=value;renderDetection();}});
  function renderDetection(){
    if(running||done||versionBlocked)return;
    const ready=deviceState.kind==='ready';
    $('upgrade-detection').classList.toggle('ready',ready);
    $('upgrade-detection').classList.toggle('needs-authorization',!ready);
    $('upgrade-detection-text').textContent=ready
      ? !identity?'已检测到 RPI-RP2。仍需先在正常模式识别键盘型号。':release?'已授权 · RPI-RP2 已连接，升级设备已就绪。':'已授权 · RPI-RP2 已连接，正在等待此型号的升级包。'
      : deviceState.kind==='multiple'?'发现多个 RP2 Boot，请选择要升级的那一把键盘。'
      : deviceState.kind==='unsupported'?'此浏览器不支持升级设备检测，请使用桌面版 Chrome 或 Edge。'
      : deviceState.kind==='unavailable'?'暂时无法检测设备，请点击授权后重试。'
      :'首次使用需要授权：按住 Esc 插入 USB，再点击右侧按钮，在浏览器列表中选择 RP2 Boot。已授权的设备会自动识别。';
    $('upgrade-detect').disabled=detecting||!navigator.usb;
    $('upgrade-detect').textContent=detecting?'请在浏览器中选择 RP2 Boot':ready?'重新选择设备':'授权 RP2 Boot';
    $('upgrade-detect').className=ready?'outline':'primary';
    $('upgrade-blocker').textContent=!identity?'请先在正常模式连接键盘，确认型号。':!release?(packageState==='loading'?'正在准备此型号的升级文件，请稍候。':'此型号的升级文件尚未就绪，暂不能开始升级。'):!ready?'需要授权并连接 RP2 Boot 后才能开始升级。':!$('upgrade-clear-confirm').checked?'请勾选清除图片和动画的确认项。':'升级条件已齐备，可以开始。';
    $('upgrade-start').disabled=!ready||!identity||!release||detecting||!$('upgrade-clear-confirm').checked||(needsReset&&(!snapshot||!$('upgrade-reset-confirm').checked));
    if(needsReset&&ready&&release&&identity&&$('upgrade-clear-confirm').checked)$('upgrade-blocker').textContent=!snapshot?'缺少升级前键位记录，请返回正常模式连接键盘后重试。':!$('upgrade-reset-confirm').checked?'兼容升级需要额外确认重置键位和所有屏幕数据。':'兼容重置条件已齐备，可以开始。';
  }
  $('upgrade-clear-confirm').onchange=$('upgrade-reset-confirm').onchange=()=>renderDetection();
  $('upgrade-keymap-download').onclick=()=>{if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${identity.profile.id}-before-upgrade.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
  function showVersionOnly(label,version){
    versionBlocked=true;monitor.stop();dialog.classList.add('version-only');
    $('firmware-title').textContent=label;$('upgrade-version').textContent=version;
    for(const id of ['upgrade-intro','upgrade-guide','upgrade-detection','upgrade-compatibility','upgrade-progress','upgrade-error','upgrade-status','upgrade-blocker','upgrade-start','upgrade-recovery'])$(id).hidden=true;
    dialog.querySelector('.upgrade-reset-choice').hidden=true;$('upgrade-start').disabled=true;$('upgrade-back').textContent='关闭';onStateChange?.();
  }
  function stopWaiting(){monitor.stop();onStateChange?.();}
  $('upgrade-detect').onclick=async()=>{
    if(running||done||detecting||versionBlocked)return;detecting=true;renderDetection();
    try{await monitor.choose();}catch(e){if(e.name==='NotFoundError')$('upgrade-status').textContent='尚未选择升级设备，可以重试。';else $('upgrade-error').textContent='无法连接升级设备，请确认已按住 Esc 插线，并选择 RP2 Boot。';}
    finally{detecting=false;renderDetection();}
  };
  function lock(value){running=value;$('upgrade-blocker').hidden=value||done||versionBlocked;dialog.setAttribute('aria-busy',String(value));$('upgrade-close').disabled=$('upgrade-back').disabled=value;$('upgrade-start').disabled=value||versionBlocked;$('upgrade-detect').disabled=value;$('upgrade-clear-confirm').disabled=$('upgrade-reset-confirm').disabled=value;if(!value)renderDetection();}
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
    versionBlocked=false;dialog.classList.remove('version-only');$('firmware-title').textContent='按住 Esc，再连接键盘。';$('upgrade-back').textContent='返回';dialog.querySelector('.upgrade-reset-choice').hidden=false;for(const id of ['upgrade-intro','upgrade-error','upgrade-status'])$(id).hidden=false;
    $('upgrade-preservation').textContent='升级后提供 3 个空白图片位置，需要重新上传。键位配置保留；恢复备份会保存在此浏览器。';
    identity=getIdentity();snapshot=getSnapshot?.()||null;needsReset=false;$('upgrade-compatibility').hidden=true;$('upgrade-reset-confirm').checked=false;$('upgrade-version').textContent='';if(identity?.protocol==='zmk')return;packageState='loading';release=null;uf2=null;backup=null;done=false;detecting=false;deviceState={kind:'waiting',device:null};const ticket=++generation;
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
      const state=firmwareVersionStatus(identity.buildInfo,selected);
      if(['current','newer','unsupported'].includes(state.kind)){release=selected;packageState='ready';showVersionOnly(state.kind==='current'?'当前固件已是最新版本':state.label,`${identity.buildInfo.buildId} · ${state.kind==='current'?selected.version:''}`);return;}
      const url=new URL(selected.url,new URL(import.meta.env.BASE_URL,location.href));
      if(url.origin!==location.origin)throw Error('固件必须来自当前站点');
      const file=await fetch(url,{cache:'no-store'});if(!file.ok)throw Error('固件下载失败，请重试');
      const bytes=new Uint8Array(await file.arrayBuffer());if(ticket!==generation)return;
      if(await digest(bytes)!==selected.sha256)throw Error('固件下载校验失败');
      if(ticket!==generation)return;
      release=selected;uf2=bytes;packageState='ready';
      const version=firmwareVersionStatus(identity.buildInfo,release);$('upgrade-version').textContent=`${version.label} · ${identity.buildInfo?.buildId||'—'} → ${release.version}${release.channel==='preview'?' · Preview':''}`;
      $('upgrade-intro').textContent='拔插时会保留当前型号和升级步骤。进入 RPI-RP2 后点击开始升级，网页会备份、写入、校验并重启。';
      $('upgrade-status').textContent='本次升级会清除全部旧图片和动画，不迁移旧素材。请确认下方提示后开始。';
      lock(false);
    }catch(e){if(ticket===generation){packageState='unavailable';$('upgrade-error').textContent=e.message;renderDetection();}}
  }
  $('upgrade-start').onclick=async()=>{
    if(running||versionBlocked||!release||!identity||!monitor.getDevice()||!$('upgrade-clear-confirm').checked||(needsReset&&(!snapshot||!$('upgrade-reset-confirm').checked)))return;
    lock(true);$('upgrade-error').textContent='';
    try{
      // Only this explicit action claims the selected interface and starts reads.
      const selectedDevice=monitor.getDevice();monitor.stop();
      boot=await Picoboot.connect({device:selectedDevice});
      await releaseConnection();
      $('upgrade-guide').hidden=true;
      const flash=await readFirmwareFlash(boot,p=>status('读取键盘，检查升级条件…',p*25));
      status('核对型号与清空范围…',25);
      const evidence=needsReset?{confirmed:$('upgrade-reset-confirm').checked,identity:{model:identity.profile.id,vid:identity.profile.vid,pid:identity.profile.pid,uid:identity.uid},keymap:snapshot}:null;
      const plan=await planFirmwareUpgrade(flash,uf2,release,identity.profile,{clearImages:true,compatibilityReset:evidence});
      status('保存完整恢复备份…',28);
      backup=await saveFirmwareBackup(flash,plan,boot.device.serialNumber||'');$('upgrade-recovery').hidden=false;
      if(plan.sectors.length){
        await writeFirmwarePlan(boot,plan,backup.id,(stage,p)=>status(`${stage}…`,stage==='确认设备'?30+p*15:stage==='写入固件'?45+p*35:80+p*19));
      }else{
        const again=await readFirmwareFlash(boot,p=>status('当前已是此版本，正在回读校验…',30+p*69));
        if(await digest(again)!==plan.targetSha256)throw Error('完整回读校验失败');
      }
      await boot.reboot();boot=null;done=true;$('upgrade-detection').hidden=true;
      status(plan.resetSettings?'重置升级与校验完成。键位和屏幕数据已恢复默认，请重新连接键盘。':'升级与校验完成，图片已清空，键盘已重启。重新连接后上传新图片，或启用电子宠物。',100);
      $('upgrade-start').hidden=true;
      onFinished?.();
    }catch(e){
      if(e.code==='ALREADY_CURRENT'){showVersionOnly('当前固件已是最新版本',release.version);}
      else if(e.code==='COMPATIBILITY_RESET_REQUIRED'&&release?.compatibility){needsReset=true;$('upgrade-preservation').textContent='此兼容重置会同时清除键位、宏、布局设置和全部屏幕数据。请阅读下方说明。';$('upgrade-compatibility').hidden=false;$('upgrade-guide').hidden=true;$('upgrade-status').textContent='尚未擦除或写入。请阅读兼容升级的数据重置说明。';$('upgrade-error').textContent='';}
      else if(e.name==='NotFoundError')$('upgrade-status').textContent='尚未选择升级设备，可以重试。';
      else $('upgrade-error').textContent=e.message;
      await boot?.close().catch(()=>{});boot=null;
      // After a partial write, never blindly replan from damaged contents.
      if(backup){release=null;$('upgrade-error').textContent+='\n如升级中断，请下载恢复文件，在 RPI-RP2 中拖入恢复后再重试。';}
    }finally{lock(false);if(!done&&!versionBlocked&&!backup&&dialog.open)void monitor.start();}
  };
  return {open,isRunning:()=>running,isOpenForUpgrade:()=>dialog.open&&!!identity&&!versionBlocked};
}
