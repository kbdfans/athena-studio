import {TYPING_DEFAULTS,TYPING_SIZES,normalizeTypingSettings,typingColorIndex} from './typing-settings.js';
import atlas from '../public/typing-glyphs.json';
export function setupTypingPreview(root){
const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d');
const demo=root.querySelector('[data-demo]'),type=root.querySelector('[data-type]'),pause=root.querySelector('[data-pause]'),status=root.querySelector('[data-status]');
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let settings=normalizeTypingSettings(TYPING_DEFAULTS);
let particles=[],paused=false,last=0,clock=0,queue=[],raf=0,lastShot=null;
const glyphCache=new Map();
function font(){return atlas.variants[settings.size*3+settings.weight];}
function glyph(ch,color){const key=settings.size+':'+settings.weight+':'+ch+color;if(glyphCache.has(key))return glyphCache.get(key);const f=font(),c=document.createElement('canvas');c.width=f.width;c.height=f.height;const g=c.getContext('2d'),im=g.createImageData(f.width,f.height);const rgb=color.match(/[0-9a-f]{2}/gi).map(n=>parseInt(n,16));for(let i=0;i<f.width*f.height;i++){const v=f.data[(ch.charCodeAt(0)-33)*f.stride+Math.floor(i/4)];im.data.set([...rgb,((v>>((i%4)*2))&3)*85],i*4);}g.putImageData(im,0,0);glyphCache.set(key,c);return c;}
const random=(a,b)=>a+Math.random()*(b-a),clamp=(n,a,b)=>Math.max(a,Math.min(n,b));
function spawn(char,stationary=false,at=performance.now()/1000){
 const interval=lastShot===null?Infinity:Math.max(0,at-lastShot);lastShot=at;
 const power=clamp(1-interval/.8,0,1),speed=50+125*power,size=TYPING_SIZES[settings.size],r=8+2*settings.size;
 const angle=random(-1.08,1.08),vx=Math.sin(angle)*speed,vy=-Math.cos(angle)*speed;
 const x=64,y=126-r;
 // Fade old letters early when the screen is crowded, keeping a bounded pool.
 if(particles.length>=12)for(const p of particles.slice(0,particles.length-11))p.life=Math.min(p.life,.18);
 if(particles.length>=16)particles.shift();
 particles.push({char:char.toUpperCase(),size,r,x,y,vx,vy,life:5,color:settings.colors[typingColorIndex(char.toUpperCase(),settings.mode,Math.floor(random(0,4)))]});
 return power;
}
function contain(p){
 p.vx=clamp(p.vx,-220,220);p.vy=clamp(p.vy,-220,220);
 if(p.x<2+p.r){p.x=2+p.r;if(p.vx<0)p.vx=-p.vx*.94;}
 else if(p.x>126-p.r){p.x=126-p.r;if(p.vx>0)p.vx=-p.vx*.94;}
 if(p.y<2+p.r){p.y=2+p.r;if(p.vy<0)p.vy=-p.vy*.94;}
 else if(p.y>126-p.r){p.y=126-p.r;if(p.vy>0)p.vy=-p.vy*.94;}
}
function collide(a,b){
 const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),reach=a.r+b.r;
 if(d>=reach)return;
 // Separate overlapping launch positions without adding kinetic energy.
 const nx=d>.0001?dx/d:1,ny=d>.0001?dy/d:0,push=(reach-d+.01)*.5;
 a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;
 const approach=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
 if(approach>0){
  const impulse=approach*.96;
  a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
 }
}
function physics(dt){
 // Short steps prevent fast letters passing through one another between frames.
 const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps;
 for(let k=0;k<steps;k++){
  for(const p of particles){
   p.x+=p.vx*step;p.y+=p.vy*step;p.life-=step;
   const drag=Math.exp(-.09*step);p.vx*=drag;p.vy*=drag;
  }
  particles=particles.filter(p=>p.life>0);
  for(let pass=0;pass<3;pass++){
   for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++)collide(particles[i],particles[j]);
   for(const p of particles)contain(p);
  }
 }
}
function draw(){
 ctx.globalAlpha=1;ctx.fillStyle=settings.background;ctx.fillRect(0,0,128,128);
 ctx.fillStyle=settings.grid;for(let n=16;n<128;n+=16){ctx.fillRect(n,0,1,128);ctx.fillRect(0,n,128,1);}
 ctx.textAlign='center';ctx.textBaseline='middle';
 for(const p of particles){ctx.font=`850 ${Math.round(p.size)}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;ctx.fillStyle=p.color;ctx.globalAlpha=Math.pow(clamp(p.life/5,0,1),.65);ctx.imageSmoothingEnabled=false;ctx.drawImage(glyph(p.char,p.color),Math.round(p.x)-font().width/2,Math.round(p.y)-font().height/2);}
 ctx.globalAlpha=1;ctx.strokeStyle='#191d19';ctx.lineWidth=2;ctx.strokeRect(1,1,126,126);
}
function tick(t){
 raf=0;if(!root.isConnected)return;
 const dt=last?Math.min((t-last)/1000,.04):0;last=t;
 if(!paused&&!document.hidden&&!root.hidden){clock+=dt;while(queue.length&&queue[0].at<=clock)spawn(queue.shift().char);physics(dt);draw();}
 if(queue.length||particles.length)raf=requestAnimationFrame(tick);
}
function start(){if(!raf&&!reduce){last=0;raf=requestAnimationFrame(tick);}draw();}
demo.onclick=()=>{
 particles=[];queue=[];lastShot=null;paused=false;pause.textContent='暂停';pause.setAttribute('aria-pressed','false');
 let delay=0;for(const [i,char]of [...'ATHENA90!?'].entries()){if(reduce){spawn(char,true);const p=particles[particles.length-1];p.x=25+(i%3)*39;p.y=22+Math.floor(i/3)*28;}else queue.push({char,at:clock+delay});delay+=Math.max(.09,.7-i*.065);}
 status.textContent=reduce?'系统已启用减少动态效果 · 静态预览':'示例由慢到快 · 底部中央喷射 · 字母相互碰撞、碰壁反弹后淡出';start();
};
type.onclick=()=>{status.textContent='可输入字母、数字和标点 · Tab 退出 · 不保存输入';};
type.onkeydown=e=>{
 if(e.key==='Tab'||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.repeat)return;
 let char=e.key;
 if(e.isComposing||char==='Process'){if(/^Key[A-Z]$/.test(e.code))char=e.code.slice(3).toLowerCase();else return;}
 if(char.length!==1||char<'!'||char>'~')return;
 e.preventDefault();queue=[];const power=spawn(char,reduce);status.textContent=`喷射力度 ${Math.round(30+70*power)}% · 同屏 ${particles.length} / 16 · 碰撞反弹`;start();
};
pause.onclick=()=>{paused=!paused;pause.textContent=paused?'继续':'暂停';pause.setAttribute('aria-pressed',String(paused));if(!paused)start();};
document.addEventListener('visibilitychange',()=>{last=0;});
for(const [i,char]of [...'ATHENA'].entries()){spawn(char,true);const p=particles[i];p.x=27+(i%3)*36;p.y=43+Math.floor(i/3)*44;}
lastShot=null;pause.disabled=reduce;draw();
return {setSettings(value){settings=normalizeTypingSettings(value);glyphCache.clear();particles=[];queue=[];lastShot=null;for(const [i,char]of [...'ABC12?'].entries()){spawn(char,true);const p=particles[i];p.x=27+(i%3)*36;p.y=43+Math.floor(i/3)*44;}lastShot=null;draw();}};
}
