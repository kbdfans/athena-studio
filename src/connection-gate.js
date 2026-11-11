export const canEnterStudio=(runtime,ready)=>!!(ready&&runtime&&!runtime.broken&&runtime.device?.opened&&runtime.isRuntime);
export function renderConnectionGate(runtime,ready,busy,root=document){
 const open=canEnterStudio(runtime,ready),gate=root.getElementById('connection-gate');
 root.body.classList.toggle('connection-required',!open);
 gate.hidden=open;root.getElementById('studio-main').inert=!open;
 root.getElementById('gate-connect').disabled=busy||!navigator.hid;
 root.getElementById('gate-connect').textContent=busy?'正在连接…':'连接键盘 ↗';
 if(!navigator.hid)root.getElementById('gate-error').textContent='请使用桌面版 Chrome 或 Edge，并通过 USB 连接键盘。';
 if(!open){for(const dialog of root.querySelectorAll('dialog[open]'))dialog.close();root.body.classList.remove('workspace-modal-open');}
 return open;
}
