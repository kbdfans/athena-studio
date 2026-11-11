// Identity is a USB VID/PID + Vial UID tuple. Upstream reuses the UID across models.
const uid='2ee60e2334ef9937';
export const DEVICE_PROFILES=Object.freeze({
 athena75:Object.freeze({id:'athena75',name:'Athena75',vid:0x9d5b,pid:0x2513,uid,rows:11,cols:8,layers:8,layoutOptions:10,physicalMask:0x1e0,deviceLayoutMask:0xe0,layoutGroups:4,screenStudio:true}),
 athena1800:Object.freeze({id:'athena1800',name:'Athena1800',vid:0x9d5b,pid:0x4100,uid,rows:14,cols:8,layers:8,layoutOptions:0,physicalMask:0x700,deviceLayoutMask:0,layoutGroups:3,screenStudio:false}),
});
export function identifyProfile(device,identity){return Object.values(DEVICE_PROFILES).find(p=>p.vid===device.vendorId&&p.pid===device.productId&&p.uid===identity)||null;}
export function profileForMap(map){const p=DEVICE_PROFILES[map?.model||'athena75'];if(!p||map.uid!==p.uid||map.rows!==p.rows||map.cols!==p.cols||map.layers!==p.layers)throw Error('键位文件与键盘型号不匹配');return p;}
