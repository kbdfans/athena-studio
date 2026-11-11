// Use official protobuf messages; own lifecycle prevents unbounded pending RPCs.
export async function connectZmkSerial({onDisconnect=()=>{},port:selectedPort}={}){
 if(!navigator.serial)throw Error('ZMK USB 配置需要桌面版 Chrome 或 Edge');
 const port=selectedPort||await navigator.serial.requestPort(); // Must be called in the user gesture.
 const {Request,Response}=await import('@zmkfirmware/zmk-studio-ts-client/studio');
 const {get_decoder,get_encoder}=await import('@zmkfirmware/zmk-studio-ts-client/framing');
 await port.open({baudRate:12500});
 const reader=port.readable.pipeThrough(new TransformStream(get_decoder())).getReader(),writer=port.writable.getWriter();
 let closed=false,pending=null,sequence=0;
 async function close(){if(closed)return;closed=true;if(pending){clearTimeout(pending.timer);pending.reject(Error('ZMK 连接已关闭'));pending=null;}await reader.cancel().catch(()=>{});reader.releaseLock();await writer.abort().catch(()=>{});writer.releaseLock();await port.close().catch(()=>{});}
 void(async()=>{try{while(!closed){const {value,done}=await reader.read();if(done)throw Error('ZMK 连接已断开');const decoded=Response.decode(value),r=decoded.requestResponse;if(!r)continue;if(!pending||r.requestId!==pending.id)throw Error('ZMK 通信序号不匹配，请重新连接');const task=pending;pending=null;clearTimeout(task.timer);if(r.meta)task.reject(Error('ZMK 拒绝请求，请检查解锁状态和固件支持'));else task.resolve(r);}}catch(e){if(!closed){onDisconnect(e);await close();}}})();
 return {port,close,call(req){
  if(closed||pending)return Promise.reject(Error('ZMK 连接不可用或仍在通信'));
  return new Promise((resolve,reject)=>{const id=sequence++;pending={id,resolve,reject,timer:setTimeout(()=>{onDisconnect(Error('ZMK 通信超时'));void close();},5000)};
   const chunks=[];get_encoder().transform(Request.encode(Request.create({...req,requestId:id})).finish(),{enqueue:b=>chunks.push(b)});
   const data=new Uint8Array(chunks.reduce((n,b)=>n+b.length,0));let offset=0;for(const b of chunks){data.set(b,offset);offset+=b.length;}
   writer.write(data).catch(async e=>{onDisconnect(e);await close();});
  });
 }};
}
