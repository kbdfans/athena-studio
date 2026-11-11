export const canEnterStudio=(runtime,ready,demo=false)=>demo||!!(ready&&runtime&&!runtime.broken&&runtime.device?.opened&&runtime.isRuntime);
export function renderConnectionGate(runtime,ready,busy,root=document,demo=false,upgrading=false){
 const open=canEnterStudio(runtime,ready,demo),gate=root.getElementById('connection-gate');
 root.body.classList.toggle('connection-required',!open&&!upgrading);
 gate.hidden=open||upgrading;root.getElementById('studio-main').inert=!open;
 root.getElementById('gate-connect').disabled=busy||(!navigator.hid&&!navigator.serial)||root.getElementById('connection-model')?.value==='';
 root.getElementById('gate-connect').textContent=busy?'正在连接…':'连接键盘 ↗';
 if(!navigator.hid&&!navigator.serial)root.getElementById('gate-error').textContent='请使用桌面版 Chrome 或 Edge，并通过 USB 连接键盘。';
 if(!open){for(const dialog of root.querySelectorAll('dialog[open]:not([data-connection-independent])'))dialog.close();root.body.classList.remove('workspace-modal-open');}
 return open;
}
