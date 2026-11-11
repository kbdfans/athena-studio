import {DEVICE_PROFILES} from "./device-profiles.js";
import {profileLayout} from "./profile-layouts.js";
import { platformKeyLabel } from './platform-keys.js';


import { keyboardLayout } from './keyboard-layout.js';
import { keycapStyle, KEYBOARD_ASPECT_RATIO, SCREEN_POSITION } from './keyboard-geometry.js';
import { keyInfo } from './keycodes.js';
import { KeymapDevice } from './keymap-protocol.js';
import { TestAudio, readTestAudioSettings } from './keyboard-test-audio.js';
import { KeyboardTestState, matrixKeys, browserCode } from './keyboard-test-state.js';
const $ = (id) => document.getElementById(id);
export function setupKeyboardTester({ getDevice, getBusy, getLayoutOptions, getProfile=()=>null }) {
  let profile=DEVICE_PROFILES.athena75,defaults=profileLayout(profile).defaults,profileId=null;
  const state = new KeyboardTestState();
  const audio = new TestAudio();
  let preferences;
  try { preferences = readTestAudioSettings(localStorage); } catch { preferences = readTestAudioSettings({getItem:()=>null}); }
  $('tester-sound').value = preferences.sound;
  $('tester-volume').value = preferences.volume;
  $('tester-volume-label').textContent = `${preferences.volume}%`;
  async function enableAudio() {
    if(preferences.sound==='off'||preferences.volume===0)return;
    try {await audio.enable();$('tester-audio-status').textContent='';}
    catch {$('tester-audio-status').textContent='提示音不可用，可继续无声测试。';}
  }
  function setAudioPreferences() {
    preferences={sound:$('tester-sound').value,volume:Number($('tester-volume').value)};
    $('tester-volume-label').textContent=`${preferences.volume}%`;
    try {localStorage.setItem('athena-test-audio',JSON.stringify(preferences));}catch {}
  }
  $('tester-sound').onchange=async()=>{setAudioPreferences();await enableAudio();audio.play(preferences.sound,preferences.volume);};
  $('tester-volume').oninput=setAudioPreferences;
  $('tester-sound-preview').onclick=async()=>{await enableAudio();audio.play(preferences.sound,preferences.volume);};
  let visible = false, active = false, starting = false, mode = 'browser', epoch = 0, timer,
    manualPaused = false, focused = document.hasFocus(), focusTimer = null, focusDeadline = 0, failedDevice = null, lastDevice = null, device = null, keys = [], buttons = new Map(), codes = new Map(), browserPositions = new Set(), layout = null;
  const live = () => { const d = getDevice(); return d && !d.broken && d.device.opened ? d : null; };
  const name = (id) => { const [r,c] = id.split(',').map(Number); return platformKeyLabel(keyInfo(defaults[r*8+c])); };
  function renderBoard() {
    const nextLayout = getLayoutOptions();
    const nextProfile=getDevice()?.profile||getProfile()||DEVICE_PROFILES.athena75;
    if (layout === nextLayout&&profileId===nextProfile.id) return;
    profile=nextProfile;profileId=profile.id;const geometry=profileLayout(profile,nextLayout);defaults=geometry.defaults;
    layout = nextLayout;
    state.clear();
    keys = geometry.keys;
    buttons = new Map(); codes = new Map();
    const host = $('tester-keyboard'); host.replaceChildren(); host.style.aspectRatio = `${geometry.board.width} / ${geometry.board.height}`;
    for (const k of keys) {
      const id = `${k.row},${k.col}`, label = name(id), cap = document.createElement('div');
      cap.className = 'keycap tester-keycap';
      if(profile.id==="athena75"&&k.row===8 && k.col===2) cap.classList.add('image-button'); cap.dataset.matrix = id;
      cap.textContent = label === '切换图片' ? '图片' : label;
      cap.setAttribute('aria-label', `${label}：未检测`);
      cap.style.cssText = keycapStyle(k,geometry.board);
      host.append(cap); buttons.set(id,cap);
      const code = browserCode(defaults[k.row*8+k.col]);
      if (code) codes.set(code,id);
    }
    browserPositions = new Set(codes.values());
    if(geometry.screen){const screen = document.createElement('div'); screen.className='tester-screen'; screen.style.cssText=keycapStyle(geometry.screen,geometry.board); screen.textContent='ATHENA'; host.append(screen);}
    paint();
  }
  function paint() {
    const physical = $('tester-input-mode').value === 'matrix';
    for (const [id,cap] of buttons) {
      const unavailable = !physical && !browserPositions.has(id);
      const visual = unavailable?'unavailable':state.held.has(id)?'pressed':state.seen.has(id)?'tested':'idle';
      if(cap.dataset.visual===visual)continue;
      cap.dataset.visual=visual;
      cap.classList.toggle('unavailable', unavailable);
      cap.title = unavailable ? `${name(id)}：请连接键盘并选择物理按键模式` : ''; 
      cap.classList.toggle('tested',state.seen.has(id)); cap.classList.toggle('pressed',state.held.has(id));
      cap.setAttribute('aria-label',`${name(id)}：${unavailable?'仅物理模式可检测':state.held.has(id)?'正在按下':state.seen.has(id)?'已检测':'未检测'}`);
    }
    $('tester-held').textContent=state.held.size;
    $('tester-count').textContent=`${state.seen.size} / ${physical ? buttons.size : browserPositions.size}`;
    $('tester-total').textContent=state.total;
    $('tester-history').textContent=state.history.map(name).join(' · ') || '暂无记录';
  }
  function update(ids) {
    const added = state.update(ids.filter(id=>buttons.has(id)));
    if (added.length) {
      audio.play(preferences.sound,preferences.volume);
      const id = added.at(-1);
      $('tester-last').textContent=name(id);
      if(mode==='matrix') $('tester-code').textContent=`物理位置 · 行 ${id.split(',')[0]} / 列 ${id.split(',')[1]}`;
    }
    paint();
  }
  function stop(message='测试已暂停，记录已保留。') {
    epoch++; clearTimeout(timer); clearTimeout(focusTimer); focusTimer=null;focusDeadline=0; active=false; starting=false;
    state.release(); paint();
    $('tester-toggle').textContent='继续检测'; $('tester-toggle').disabled=false;
    $('tester-status').textContent=message;
  }
  async function start() {
    if (starting || active || getBusy() || !visible || document.hidden || document.querySelector('dialog[open]:not(#tester-dialog)')) return;
    void enableAudio();
    const token=++epoch; starting=true;
    $('tester-toggle').disabled=true;
    $('tester-status').textContent='正在准备测试…';
    device=live();
    const requested=$('tester-input-mode').value;
    $('tester-mode').textContent=requested==='matrix'?'物理按键模式 · 含 MO/Fn，需连接 Athena75':'浏览器模式 · 不支持 MO/Fn';
    if(requested==='matrix'&&!device){stop('等待连接 Athena75，连接成功后自动检测（含 MO/Fn）。');$('tester-toggle').textContent='等待连接';$('tester-toggle').disabled=true;return;}

    try {
      let available=false;
      if(device && requested==='matrix') {
        const started=Date.now();
        while(device.pending && Date.now()-started<5500 && token===epoch) await new Promise(r=>setTimeout(r,20));
        if(token!==epoch) return;
        available=await new KeymapDevice(device).matrixAvailable();
      }
      if(token!==epoch) return;
      if(requested==='matrix'&&!available){failedDevice=device;stop('物理矩阵不可读取；浏览器模式不能检测 MO/Fn。');return;}
      if(token!==epoch)return;
      const nextMode=available?'matrix':'browser';
      // Browser-reported codes and physical switch positions are different evidence.
      if(mode!==nextMode) {state.clear(); $('tester-last').textContent='等待输入'; $('tester-code').textContent='—';}
      mode=nextMode; active=true; starting=false;
      $('tester-toggle').disabled=false; $('tester-toggle').textContent='暂停检测';
      $('tester-mode').textContent=mode==='matrix'?`物理按键模式 · ${profile.name} USB 直读`:'浏览器模式 · 检测系统收到的按键';
      $('tester-status').textContent=mode==='matrix'?'正在读取物理矩阵，MO/Fn 也应对应高亮。':'正在检测浏览器按键；MO/Fn 不会发送系统键码，因此不计入此模式。';
      $('tester-note').textContent=mode==='matrix'?'只读检测物理按键，不修改键位。短按过快可能漏采，可再次按下确认；离页暂停，返回自动继续；系统快捷键导致失焦时短暂完成采样后暂停。':'浏览器模式可接收任意键盘输入，不能区分设备。Fn、屏幕功能键及系统截获的快捷键可能不触发；改键后按系统收到的键码显示。';
      $('tester-surface').focus({preventScroll:true}); paint();
      if(mode==='matrix') tick(token);
    } catch(e) { if(token===epoch) {failedDevice=device;stop(`无法开始测试：${e.message}`);} }
  }
  async function tick(token) {
    if(token!==epoch || !active || !visible) return;
    if(focusDeadline && Date.now()>=focusDeadline){stop('检测已暂停，返回此页自动继续。');return;}
    if(device!==live()) {stop('键盘连接已断开，重新连接后会自动检测。'); return;}
    if(!getBusy() && !device.pending) {
      try { const rows=await new KeymapDevice(device).readMatrix(); if(token!==epoch)return; if(focusDeadline && Date.now()>=focusDeadline){stop();return;} update(matrixKeys(rows,profile.rows)); }
      catch(e) {if(token===epoch){failedDevice=device;stop(`检测暂停：${e.message}`);}return;}
    }
    if(token===epoch) timer=setTimeout(()=>tick(token),8);
  }
  function onKey(event) {
    if(!active || !visible || document.hidden || document.querySelector('dialog[open]:not(#tester-dialog)')) return;
    // Keep the sound and mode controls keyboard-accessible while testing.
    if(event.key !== 'Tab' && event.target?.closest?.('.tester-options, .tester-actions, .modal-heading, .modal-notices'))return;
    if(audio.context?.state!=='running')void enableAudio();
    if(event.key !== 'Tab') { event.preventDefault(); event.stopPropagation(); }
    if(event.type==='keydown') $('tester-code').textContent=`${event.code || '未知键码'} · ${event.key===' '?'Space':event.key}`;
    if(mode!=='browser') return;
    const id=codes.get(event.code);
    if(!id) {if(event.type==='keydown')$('tester-last').textContent=`${event.key}（布局外）`;return;}
    const held=new Set(state.held);
    event.type==='keydown'?held.add(id):held.delete(id);
    update([...held]);
  }
  window.addEventListener('keydown',onKey,true); window.addEventListener('keyup',onKey,true);
  function autoStart() {
    if(!visible || !focused || manualPaused || document.hidden || getBusy() || document.querySelector('dialog[open]:not(#tester-dialog)'))return;
    if(failedDevice && failedDevice===live())return;
    clearTimeout(focusTimer);focusTimer=null;focusDeadline=0;
    void start();
  }
  function loseFocus() {
    if(!active&&!starting)return;
    // F11 can move focus before its USB reply arrives. Finish a bounded sample
    // window, then stop; never keep recording an unfocused keyboard indefinitely.
    if(active && mode==='matrix') {
      if(focusTimer===null){focusDeadline=Date.now()+200;focusTimer=setTimeout(()=>stop('检测已暂停，返回此页自动继续。'),200);}
    } else stop('检测已暂停，返回此页自动继续。');
  }
  window.addEventListener('blur',()=>{focused=false;loseFocus();});
  window.addEventListener('focus',()=>{focused=true;autoStart();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)loseFocus();else {focused=document.hasFocus();autoStart();}});
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',autoStart));
  $('tester-input-mode').onchange=()=>{
    stop();manualPaused=false;failedDevice=null;
    $('tester-mode').textContent=$('tester-input-mode').value==='matrix'?'物理按键模式 · 含 MO/Fn，需连接 Athena75':'浏览器模式 · 不支持 MO/Fn';
    state.clear();paint();$('tester-last').textContent='等待输入';$('tester-code').textContent='—';autoStart();
  };
  $('tester-toggle').onclick=()=>{
    if(active||starting){manualPaused=true;stop('已手动暂停，点击“继续检测”恢复。');}
    else {manualPaused=false;failedDevice=null;autoStart();}
  };
  $('tester-clear').onclick=()=>{state.clear();$('tester-last').textContent='等待输入';$('tester-code').textContent='—';paint();if(active)$('tester-surface').focus({preventScroll:true});};
  return {
    setVisible(value) {
      visible=value;
      if(!value) {if(active||starting)stop();}
      else {manualPaused=false;failedDevice=null;renderBoard();autoStart();}
    },
    refreshConnection() {
      const current=live(),changed=current!==lastDevice;lastDevice=current;
      if((active||starting)&&device!==current)stop('连接已变化，正在等待设备就绪。');
      if(changed)failedDevice=null;
      if(visible&&!active&&!starting){renderBoard();autoStart();}
    },
  };
}
