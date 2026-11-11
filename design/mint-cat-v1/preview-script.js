
(()=>{
const root=document.getElementById('mint-cat-animation'),$=s=>root.querySelector(s),canvas=$('#mc-canvas'),ctx=canvas.getContext('2d');
const data=JSON.parse(document.getElementById('mc-assets').textContent),raw=atob(data.pixels),sprites=[];
for(let f=0;f<20;f++){const c=document.createElement('canvas');c.width=40;c.height=32;const s=c.getContext('2d'),image=s.createImageData(40,32);for(let i=0;i<1280;i++){const n=(raw.charCodeAt(f*320+(i>>2))>>((i&3)*2))&3;image.data.set(data.palette[n],i*4);}s.putImageData(image,0,0);sprites.push(c);}
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const sequences={run:[4,5,6,7,8,9,10,11],jump:[12,13,14,15,16,17,18,19],idle:[0,3,0,1],sleep:[2]};
const times={run:[95,70,80,65,85,65,80,90],jump:[150,160,80,100,130,100,130,200],idle:[1800,400,1400,2000],sleep:[2000]};
const heights={run:[0,1,4,0,0,2,5,0],jump:[0,0,3,15,24,14,0,0],idle:[0,0,0,0],sleep:[0]};
const phases={run:['后腿蓄力','蹬地','伸展腾空','前爪触地','前肢承重','收腿','收拢腾空','准备下一步'],jump:['准备','屈腿蓄力','蹬伸起跳','上升收腿','最高点','伸爪下落','落地缓冲','回稳'],idle:['站立','抬头','站立','坐下'],sleep:['蜷睡']};
let action='run',frame=0,speed=1,playing=!reduced,elapsed=0,last=0,ground='';
function theme(){const e=document.createElement('span');e.style.color='var(--border)';root.append(e);ground=getComputedStyle(e).color;e.remove();draw();}
function draw(){const seq=sequences[action];let h=heights[action][frame];if(action==='jump'&&playing&&frame<7)h+=(heights.jump[frame+1]-h)*Math.min(1,elapsed/times.jump[frame]);ctx.clearRect(0,0,128,128);ctx.imageSmoothingEnabled=false;ctx.fillStyle=ground;ctx.beginPath();ctx.ellipse(64,104,25-h*.3,2,0,0,Math.PI*2);ctx.fill();ctx.drawImage(sprites[seq[frame]],24,40-Math.round(h),80,64);$('#mc-phase').textContent=phases[action][frame];$('#mc-count').textContent=String(frame+1).padStart(2,'0')+' / '+String(seq.length).padStart(2,'0');$('#mc-frame').max=seq.length-1;$('#mc-frame').value=frame;$('#mc-play').textContent=playing?'暂停':action==='jump'&&frame===7?'再跳一次':'播放';canvas.setAttribute('aria-label',`原创薄荷猫，${phases[action][frame]}，第 ${frame+1} 帧`);}
function remember(){window.openai?.setWidgetState?.({modelContent:{asset:'original-mint-v1',action,frame:frame+1},privateContent:{asset:'original-mint-v1',action,frame,speed,playing}})?.catch(()=>{});}
function restore(s){const v=s?.privateContent;if(!v||v.asset!=='original-mint-v1')return;if(Object.hasOwn(sequences,v.action))action=v.action;frame=Number.isInteger(v.frame)&&v.frame>=0&&v.frame<sequences[action].length?v.frame:0;if([1,.5,.25].includes(v.speed))speed=v.speed;playing=!!v.playing;elapsed=0;$('#mc-action').value=action;$('#mc-speed').value=speed;draw();}
function setAction(a){action=a;frame=0;elapsed=0;playing=!reduced;$('#mc-action').value=a;draw();remember();}
function manual(n){const total=sequences[action].length;frame=(n+total)%total;elapsed=0;playing=false;draw();$('#mc-live').textContent=phases[action][frame];remember();}
$('#mc-action').onchange=e=>setAction(e.target.value);$('#mc-jump').onclick=()=>{if(action==='jump'&&playing)return;setAction('jump');playing=true;draw();remember();};$('#mc-speed').onchange=e=>{speed=Number(e.target.value);remember();};$('#mc-frame').oninput=e=>manual(Number(e.target.value));$('#mc-prev').onclick=()=>manual(frame-1);$('#mc-next').onclick=()=>manual(frame+1);$('#mc-play').onclick=()=>{if(!playing&&action==='jump'&&frame===7){frame=0;elapsed=0;}playing=!playing;draw();remember();};
function tick(now){const dt=last?Math.min(100,now-last):0;last=now;if(playing&&!document.hidden){elapsed+=dt*speed;while(elapsed>=times[action][frame]){elapsed-=times[action][frame];if(action==='jump'&&frame===7){playing=false;elapsed=0;break;}frame=(frame+1)%sequences[action].length;}draw();}requestAnimationFrame(tick);}
theme();restore(window.openai?.widgetState);window.addEventListener('openai:set_globals',e=>{if(e.detail?.globals?.widgetState)restore(e.detail.globals.widgetState);});new MutationObserver(theme).observe(document.documentElement,{attributes:true,attributeFilter:['class','style','data-theme']});requestAnimationFrame(tick);
})();
