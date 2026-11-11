// Native ZMK bindings stay native: never store them as QMK 16-bit keycodes.
export const sameBinding=(a,b)=>!!a&&!!b&&a.behaviorId===b.behaviorId&&a.param1===b.param1&&a.param2===b.param2;
export function validateZmkData(map,physical){
 if(!map?.layers?.length||map.layers.length>64||new Set(map.layers.map(l=>l.id)).size!==map.layers.length)throw Error('ZMK 层数据无效');
 if(!physical?.layouts?.length||physical.layouts.length>128||!Number.isInteger(physical.activeLayoutIndex)||!physical.layouts[physical.activeLayoutIndex])throw Error('ZMK 布局数据无效');
 for(const l of physical.layouts){if(!l.keys?.length||l.keys.length>512)throw Error('ZMK 布局数据无效');for(const k of l.keys){if(!['width','height','x','y','r','rx','ry'].every(n=>Number.isFinite(k[n]??0))||k.width<=0||k.height<=0||k.width>3000||k.height>3000||Math.abs(k.x)>10000||Math.abs(k.y)>10000)throw Error('ZMK 键帽尺寸无效');}}
 const count=physical.layouts[physical.activeLayoutIndex].keys.length;
 for(const l of map.layers){if(!Number.isInteger(l.id)||l.id<0||!Array.isArray(l.bindings)||l.bindings.length<count||l.bindings.length>512)throw Error('ZMK 键位数量不匹配');for(const b of l.bindings){if(!Number.isInteger(b.behaviorId)||b.behaviorId<0||![b.param1,b.param2].every(x=>Number.isInteger(x)&&x>=0&&x<=0xffffffff))throw Error('ZMK 按键参数无效');}}
 return map;
}
function permits(desc,value,layers){
 if(desc.nil!==undefined)return value===0;
 if(desc.constant!==undefined)return value===desc.constant;
 if(desc.range)return value>=desc.range.min&&value<=desc.range.max;
 if(desc.layerId!==undefined)return layers.some(l=>l.id===value);
 if(desc.hidUsage){const page=(value>>>16)&255,usage=value&65535;return (page===7&&usage<=desc.hidUsage.keyboardMax)||(page===12&&usage<=desc.hidUsage.consumerMax);}
 return false;
}
export function validBinding(binding,behaviors,layers){
 if(!binding||![binding.behaviorId,binding.param1,binding.param2].every(n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff))return false;
 const b=behaviors.find(b=>b.id===binding.behaviorId);if(!b)return false;
 if(b.metadata.length===0)return binding.param1===0&&binding.param2===0;
 return b.metadata.some(m=>(m.param1.length?m.param1.some(d=>permits(d,binding.param1,layers)):binding.param1===0)&&(m.param2.length?m.param2.some(d=>permits(d,binding.param2,layers)):binding.param2===0));
}
export function keypressBehavior(behaviors){
 // Metadata plus the standard name; do not mistake Mod-Tap's second HID argument for &kp.
 return behaviors.find(b=>/^(key press|keypress|kp)$/i.test(b.displayName)&&b.metadata.some(m=>m.param1.some(d=>d.hidUsage)&&m.param2.every(d=>d.nil!==undefined)));
}
export function zmkGeometry(layout){
 const raw=layout.keys.map((k,i)=>({position:i,x:k.x/100,y:k.y/100,w:k.width/100,h:k.height/100,r:(k.r||0)/100,rx:(k.rx||0)/100,ry:(k.ry||0)/100}));
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const k of raw){const a=k.r*Math.PI/180;for(const [x,y]of[[k.x,k.y],[k.x+k.w,k.y],[k.x,k.y+k.h],[k.x+k.w,k.y+k.h]]){const xx=k.rx+(x-k.rx)*Math.cos(a)-(y-k.ry)*Math.sin(a),yy=k.ry+(x-k.rx)*Math.sin(a)+(y-k.ry)*Math.cos(a);minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);}}
 return {keys:raw.map(k=>({...k,x:k.x-minX,y:k.y-minY,rx:k.rx-minX,ry:k.ry-minY})),board:{width:(maxX-minX)*19-1,height:(maxY-minY)*19-1}};
}
