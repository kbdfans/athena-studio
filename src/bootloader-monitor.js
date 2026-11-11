export const isRp2Boot = device => device?.vendorId === 0x2e8a && device?.productId === 0x0003;
// Descriptor-only detection. Never open, claim, reset, read or write a USB device here.
export function createBootloaderMonitor({usb=globalThis.navigator?.usb,onChange=()=>{},interval=1000}={}){
 let active=false,epoch=0,lifetime=0,timer=null,selected=null,current={kind:'waiting',device:null},lastKind='',lastDevice=null;
 function publish(kind,device=null){current={kind,device};if(kind!==lastKind||device!==lastDevice){lastKind=kind;lastDevice=device;onChange(current);}return current;}
 async function refresh(){
  if(!active)return current;const ticket=++epoch;
  if(!usb?.getDevices)return publish('unsupported');
  try{const devices=(await usb.getDevices()).filter(isRp2Boot);if(!active||ticket!==epoch)return current;
   if(selected&&!devices.includes(selected))selected=null;
   if(!selected&&devices.length===1)selected=devices[0];
   return publish(selected?'ready':devices.length>1?'multiple':'waiting',selected);
  }catch{if(active&&ticket===epoch){selected=null;return publish('unavailable');}return current;}
 }
 function change(e){if(e.type==='disconnect'&&e.device===selected){selected=null;epoch++;publish('waiting');}void refresh();}
 function stop(){active=false;epoch++;lifetime++;clearInterval(timer);timer=null;usb?.removeEventListener?.('connect',change);usb?.removeEventListener?.('disconnect',change);selected=null;lastKind='';lastDevice=null;current={kind:'waiting',device:null};}
 return {
  start(){stop();active=true;usb?.addEventListener?.('connect',change);usb?.addEventListener?.('disconnect',change);timer=setInterval(()=>void refresh(),interval);timer.unref?.();return refresh();},
  stop,refresh,getDevice:()=>current.kind==='ready'?current.device:null,
  async choose(){
   if(!active||!usb?.requestDevice)return null;const ticket=lifetime;
   // Called directly from the user's click to retain browser activation.
   const device=await usb.requestDevice({filters:[{vendorId:0x2e8a,productId:0x0003}]});
   if(!active||ticket!==lifetime)return null;if(!isRp2Boot(device))throw Error('UPGRADE_DEVICE_MISMATCH');
   epoch++;selected=device;publish('ready',device);return device;
  },
 };
}
