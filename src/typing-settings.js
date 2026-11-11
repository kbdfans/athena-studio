export const TYPING_DEFAULTS={size:1,weight:2,mode:1,colors:['#FF5100','#222523','#38705B','#98623C'],background:'#FFF8E8',grid:'#E7DECE'};
export const TYPING_SIZES=[14,18,22];
export const TYPING_WEIGHTS=[400,700,850];
export function color565(hex){if(!/^#[0-9a-f]{6}$/i.test(hex))throw Error('颜色格式无效');const n=parseInt(hex.slice(1),16);return ((n>>19)<<11)|(((n>>10)&63)<<5)|((n>>3)&31);}
export function hex565(n){return '#'+[(n>>11)*255/31,((n>>5)&63)*255/63,(n&31)*255/31].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();}
export function normalizeTypingSettings(value){
 if(!value||![value.size,value.weight,value.mode].every(n=>Number.isInteger(n)&&n>=0&&n<3)||!Array.isArray(value.colors)||value.colors.length!==4)throw Error('打字设置无效');
 return {size:value.size,weight:value.weight,mode:value.mode,colors:value.colors.map(c=>hex565(color565(c))),background:hex565(color565(value.background??TYPING_DEFAULTS.background)),grid:hex565(color565(value.grid??TYPING_DEFAULTS.grid))};
}
export function encodeTypingSettings(s){s=normalizeTypingSettings(s);const a=new Uint8Array(16),v=new DataView(a.buffer);a.set([2,s.size,s.weight,s.mode]);s.colors.forEach((c,i)=>v.setUint16(4+2*i,color565(c),true));v.setUint16(12,color565(s.background),true);v.setUint16(14,color565(s.grid),true);return a;}
export function decodeTypingSettings(a){if(a.length!==16||a[0]!==2)throw Error('不支持的打字设置版本');const v=new DataView(a.buffer,a.byteOffset,a.byteLength);return normalizeTypingSettings({size:a[1],weight:a[2],mode:a[3],colors:Array.from({length:4},(_,i)=>hex565(v.getUint16(4+2*i,true))),background:hex565(v.getUint16(12,true)),grid:hex565(v.getUint16(14,true))});}
export function typingColorIndex(ch,mode,random=0){if(mode===0)return 0;if(mode===1)return random%4;return /^[A-Z]$/.test(ch)?0:/^[0-9]$/.test(ch)?1:2;}
