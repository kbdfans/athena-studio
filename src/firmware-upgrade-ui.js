import {firmwareVersionStatus} from './firmware-compatibility.js';
import {createBootloaderMonitor} from './bootloader-monitor.js';
import {bootloaderGuide} from './bootloader-guide.js';
import {Picoboot} from './device.js';
import {planFirmwareUpgrade,recoveryUf2} from './firmware-plan.js';
import {readFirmwareFlash,writeFirmwarePlan} from './firmware-transport.js';
import {saveFirmwareBackup} from './firmware-backup.js';
import {digest} from './backup-v2.js';

export function setupFirmwareUpgrade({getIdentity,getSelectedProfile,getSnapshot,getBusy,releaseConnection,onFinished,onStateChange}) {
  const dialog=document.createElement('dialog');dialog.id='firmware-dialog';
  dialog.setAttribute('aria-labelledby','firmware-title');
  // Retain the guide across the intentional USB disconnect. Other workspaces close.
  dialog.dataset.connectionIndependent='true';
  dialog.innerHTML=`
    <div class="upgrade-heading">
      <h2 id="firmware-title">固件升级</h2>
      <button type="button" class="dialog-close" id="upgrade-close" aria-label="关闭">×</button>
    </div>
    <div class="upgrade-body">
      <dl class="upgrade-versions" aria-live="polite">
        <div><dt>键盘型号</dt><dd id="upgrade-model"></dd></div>
        <div><dt>当前版本</dt><dd id="upgrade-current-version"></dd></div>
        <div><dt>可升级版本</dt><dd id="upgrade-target-version"></dd></div>
      </dl>
      <div id="upgrade-workflow" class="upgrade-workflow">
        <section id="upgrade-guide" class="upgrade-panel">
          <h3>进入刷机模式</h3>
          ${bootloaderGuide()}
        </section>
        <div class="upgrade-controls">
          <section id="upgrade-detection" class="upgrade-panel upgrade-detection">
            <h3>升级设备</h3>
            <p id="upgrade-detection-text" role="status" aria-live="polite"></p>
          </section>
          <label class="upgrade-reset-choice"><input id="upgrade-clear-confirm" type="checkbox"><span><strong>我确认清除全部图片和动画</strong><small id="upgrade-preservation">升级后需重新上传图片。键位配置保留，恢复备份保存在此浏览器。</small></span></label>
          <div id="upgrade-compatibility" class="upgrade-panel upgrade-compatibility" hidden>
            <h3>历史固件兼容升级</h3>
            <p>无法确认旧配置的存储格式。可以重置为本站固件；键位、宏、布局设置、全部图片、宠物外观和成长进度都会恢复默认。恢复备份会先保存在此浏览器。</p>
            <button type="button" id="upgrade-keymap-download" class="text-button">下载升级前键位文件</button>
            <label><input type="checkbox" id="upgrade-reset-confirm">我确认这是原版 RP2040 / 16 MB 对应型号，并同意重置以上数据。</label>
          </div>
        </div>
      </div>
      <div class="upgrade-result">
        <p id="upgrade-status" role="status" aria-live="polite"></p>
        <progress id="upgrade-progress" max="100" value="0" hidden></progress>
        <p id="upgrade-error" class="error" role="alert"></p>
      </div>
    </div>
    <div class="upgrade-footer">
      <p id="upgrade-precheck" class="upgrade-blocker">请先用正常打字模式连接键盘，读取型号和版本。</p>
      <p id="upgrade-blocker" class="upgrade-blocker" role="status" aria-live="polite"></p>
      <div class="upgrade-actions">
        <button type="button" class="upgrade-download" id="upgrade-recovery" hidden>下载恢复文件</button>
        <button type="button" class="outline" id="upgrade-back">返回</button>
        <button type="button" class="primary" id="upgrade-connect" hidden>返回连接键盘</button>
        <button type="button" class="outline" id="upgrade-detect">授权 RP2 Boot</button>
        <button type="button" class="primary" id="upgrade-start" disabled>开始升级</button>
      </div>
    </div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector('#'+id);
  let versionBlocked=false,snapshot=null,needsReset=false,identity=null,release=null,uf2=null,running=false,backup=null,boot=null,generation=0,detecting=false,done=false,packageState='idle',deviceState={kind:'waiting',device:null};
  const monitor=createBootloaderMonitor({onChange:value=>{deviceState=value;renderDetection();}});
  function renderDetection(){
    if(running||done||versionBlocked)return;
    const ready=deviceState.kind==='ready';
    $('upgrade-detection').classList.toggle('ready',ready);
    $('upgrade-detection-text').textContent=ready
      ? 'RPI-RP2 已连接，可以继续。'
      : deviceState.kind==='multiple'?'发现多个 RP2 Boot，请选择要升级的那一把键盘。'
      : deviceState.kind==='unsupported'?'此浏览器不支持升级设备检测，请使用桌面版 Chrome 或 Edge。'
      : deviceState.kind==='unavailable'?'暂时无法检测设备，请点击授权后重试。'
      :'进入 RPI-RP2 后，点击授权并在浏览器列表中选择 RP2 Boot。';
    $('upgrade-detect').disabled=detecting||!navigator.usb;
    $('upgrade-detect').textContent=detecting?'请在浏览器中选择 RP2 Boot':ready?'重新选择设备':'授权 RP2 Boot';
    $('upgrade-blocker').textContent=!identity?'请先在正常模式连接键盘，确认型号。':!release?(packageState==='loading'?'正在准备此型号的升级文件，请稍候。':'此型号的升级文件尚未就绪，暂不能开始升级。'):!ready?'需要授权并连接 RP2 Boot 后才能开始升级。':!$('upgrade-clear-confirm').checked?'请勾选清除图片和动画的确认项。':'升级条件已齐备，可以开始。';
    $('upgrade-start').disabled=!ready||!identity||!release||detecting||!$('upgrade-clear-confirm').checked||(needsReset&&(!snapshot||!$('upgrade-reset-confirm').checked));
    if(needsReset&&ready&&release&&identity&&$('upgrade-clear-confirm').checked)$('upgrade-blocker').textContent=!snapshot?'缺少升级前键位记录，请返回正常模式连接键盘后重试。':!$('upgrade-reset-confirm').checked?'兼容升级需要额外确认重置键位和所有屏幕数据。':'兼容重置条件已齐备，可以开始。';
  }
  $('upgrade-clear-confirm').onchange=$('upgrade-reset-confirm').onchange=()=>renderDetection();
  $('upgrade-keymap-download').onclick=()=>{if(!snapshot)return;const url=URL.createObjectURL(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${identity.profile.id}-before-upgrade.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
  function showVersionOnly(label){
    versionBlocked=true;monitor.stop();dialog.classList.add('version-only');
    $('firmware-title').textContent=label;
    for(const id of ['upgrade-workflow','upgrade-progress','upgrade-error','upgrade-status','upgrade-precheck','upgrade-blocker','upgrade-start','upgrade-recovery','upgrade-connect','upgrade-detect'])$(id).hidden=true;
    dialog.querySelector('.upgrade-reset-choice').hidden=true;$('upgrade-start').disabled=true;$('upgrade-back').hidden=false;$('upgrade-back').textContent='关闭';onStateChange?.();
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
  $('upgrade-connect').onclick=()=>{
    close();
    const target=document.getElementById(getSelectedProfile?.()?'gate-connect':'connection-model');
    if(target?.getClientRects().length)target.focus();
  };
  // Esc is used to enter the keyboard bootloader, so it must never dismiss this guide.
  dialog.addEventListener('cancel',e=>e.preventDefault());
  dialog.addEventListener('close',()=>{monitor.stop();onStateChange?.();});
  window.addEventListener('beforeunload',e=>{if(running){e.preventDefault();e.returnValue='';}});
  $('upgrade-recovery').onclick=()=>{
    if(!backup)return;const url=URL.createObjectURL(new Blob([recoveryUf2(backup.data)]));const a=document.createElement('a');a.href=url;a.download=`${backup.model}-recovery-${backup.id}.uf2`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  async function open(){
    if(getBusy()||running)return;
    const nextIdentity=getIdentity();
    const profile=nextIdentity?.profile||getSelectedProfile?.();
    if(nextIdentity?.protocol==='zmk'||profile?.keymapOnly)return;
    versionBlocked=false;dialog.classList.remove('version-only','upgrade-complete');$('firmware-title').textContent='固件升级';$('upgrade-back').textContent='返回';dialog.querySelector('.upgrade-reset-choice').hidden=false;for(const id of ['upgrade-error','upgrade-status'])$(id).hidden=false;
    $('upgrade-preservation').textContent='升级后需重新上传图片。键位配置保留，恢复备份保存在此浏览器。';
    identity=nextIdentity;snapshot=getSnapshot?.()||null;needsReset=false;$('upgrade-compatibility').hidden=true;$('upgrade-reset-confirm').checked=false;packageState='loading';release=null;uf2=null;backup=null;done=false;detecting=false;deviceState={kind:'waiting',device:null};const ticket=++generation;
    const buildInfo=identity?.buildInfo;
    $('upgrade-model').textContent=profile?.name||'尚未识别键盘';
    $('upgrade-current-version').textContent=buildInfo?.buildId||(identity?'旧版固件未提供版本信息':'连接后读取');
    $('upgrade-target-version').textContent=profile?'正在查询…':'选择键盘后显示';
    $('upgrade-clear-confirm').checked=false;$('upgrade-error').textContent='';$('upgrade-status').textContent='';$('upgrade-guide').hidden=false;$('upgrade-progress').hidden=true;$('upgrade-recovery').hidden=true;
    $('upgrade-workflow').hidden=false;
    $('upgrade-precheck').hidden=!!identity;
    $('upgrade-connect').hidden=!!identity;
    $('upgrade-back').hidden=!identity;
    $('upgrade-detect').hidden=$('upgrade-detection').hidden=!identity;
    dialog.querySelector('.upgrade-reset-choice').hidden=!identity;
    $('upgrade-start').hidden=!identity;
    lock(false);
    $('upgrade-blocker').hidden=!identity;
    if(!dialog.open)dialog.showModal();
    onStateChange?.();
    if(identity)void monitor.start();
    if(!profile)return;
    try{
      const manifestUrl=import.meta.env.DEV?'/__firmware-test/releases.json':`${import.meta.env.BASE_URL}firmware/releases.json`;
      const response=await fetch(manifestUrl,{cache:'no-store'});
      if(!response.ok)throw Error('此型号的在线升级包正在验证，暂未开放写入。可以先查看操作图示。');
      const manifest=await response.json();if(ticket!==generation)return;
      if(manifest.schema!==1||!Array.isArray(manifest.releases))throw Error('升级信息格式不正确');
      const selected=manifest.releases.find(r=>r.model===profile.id&&r.pid===profile.pid);
      if(!selected)throw Error('此型号的在线升级包正在验证，暂未开放写入。可以先查看操作图示。');
      const version=firmwareVersionStatus(buildInfo,selected);
      const target=selected.buildId?`${selected.version} · ${selected.buildId}`:selected.version;
      $('upgrade-target-version').textContent=target;
      if(!identity)return;
      if(version.kind==='current')$('upgrade-current-version').textContent=target;
      if(['current','newer','unsupported'].includes(version.kind)){
        $('upgrade-target-version').textContent='无可用更新';
        showVersionOnly(version.kind==='current'?'当前固件已是最新版本':version.label);return;
      }
      if(!navigator.usb){$('upgrade-status').textContent='在线升级需要桌面版 Chrome 或 Edge。';return;}
      const url=new URL(selected.url,new URL(import.meta.env.BASE_URL,location.href));
      if(url.origin!==location.origin)throw Error('固件必须来自当前站点');
      const file=await fetch(url,{cache:'no-store'});if(!file.ok)throw Error('固件下载失败，请重试');
      const bytes=new Uint8Array(await file.arrayBuffer());if(ticket!==generation)return;
      if(await digest(bytes)!==selected.sha256)throw Error('固件下载校验失败');
      if(ticket!==generation)return;
      release=selected;uf2=bytes;packageState='ready';
      lock(false);
    }catch(e){if(ticket===generation){packageState='unavailable';$('upgrade-target-version').textContent='暂无可用升级包';$('upgrade-error').textContent=e.message;renderDetection();}}
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
      await boot.reboot();boot=null;done=true;dialog.classList.add('upgrade-complete');$('upgrade-detect').hidden=$('upgrade-detection').hidden=true;
      status(plan.resetSettings?'重置升级与校验完成。键位和屏幕数据已恢复默认，请重新连接键盘。':'升级与校验完成，图片已清空，键盘已重启。重新连接后上传新图片，或启用电子宠物。',100);
      $('upgrade-start').hidden=true;
      onFinished?.();
    }catch(e){
      if(e.code==='ALREADY_CURRENT'){
        $('upgrade-current-version').textContent=release.version;
        $('upgrade-target-version').textContent='无可用更新';
        showVersionOnly('当前固件已是最新版本');
      }
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
