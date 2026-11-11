// Names are navigation hints only. The connected firmware supplies the real identity.
export const CONNECTION_MODELS=Object.freeze([
 {id:'athena75',name:'Athena75',protocol:'qmk'},
 {id:'athena1800',name:'Athena1800',protocol:'qmk'},
 {id:'agar-micro',name:'Agar Micro',protocol:'zmk'},
 {id:'tofu60-ble',name:'Tofu60 BLE 3.0',protocol:'zmk'},
 {id:'other-compatible',name:'其他兼容键盘',protocol:'zmk'},
]);
export const connectionModel=id=>CONNECTION_MODELS.find(m=>m.id===id);
export function readConnectionModel(storage){try{const id=storage.getItem('studio-keyboard-model');return connectionModel(id)?id:'';}catch{return '';}}
export function rememberConnectionModel(id,storage){if(connectionModel(id))try{storage.setItem('studio-keyboard-model',id);}catch{}}
const portKey=id=>'studio-serial-identity:'+id;
function usbIdentity(port){try{const i=port.getInfo();return [i.usbVendorId,i.usbProductId].every(n=>Number.isInteger(n)&&n>=0&&n<=65535)?{usbVendorId:i.usbVendorId,usbProductId:i.usbProductId}:null;}catch{return null;}}
export function rememberSerialPort(model,port,storage){const i=usbIdentity(port);if(i)try{storage.setItem(portKey(model),JSON.stringify(i));}catch{}}
export async function chooseSerialPort({model,serial,storage,forcePrompt=false}){
 if(!forcePrompt){
  let saved;try{saved=JSON.parse(storage.getItem(portKey(model)));}catch{}
  if(saved&&[saved.usbVendorId,saved.usbProductId].every(Number.isInteger)&&serial.getPorts){
   let ports=[];try{ports=await serial.getPorts();}catch{}
   const matches=ports.filter(p=>{const i=usbIdentity(p);return i&&i.usbVendorId===saved.usbVendorId&&i.usbProductId===saved.usbProductId;});
   if(matches.length===1)return matches[0];
  }
 }
 // First use, revoked permission, or ambiguous devices: preserve the browser chooser.
 return serial.requestPort();
}
