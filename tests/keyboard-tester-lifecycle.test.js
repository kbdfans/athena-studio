import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fakeZmk} from './helpers/zmk-fixture.js';
const root=new URL('../src/',import.meta.url);
let source=fs.readFileSync(new URL('keyboard-tester.js',root),'utf8');
for(const [name,file]of [['definition','athena-definition.json'],['defaults','athena-defaults.json']])source=source.replace(`import ${name} from './${file}';`,`const ${name}=${fs.readFileSync(new URL(file,root),'utf8')};`);
source=source.replace(/from ['"](\.\/[^'"]+)['"]/g,(_,p)=>`from '${new URL(p,root)}'`);
const {setupKeyboardTester}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
class Element {
 textContent='';value='';disabled=false;dataset={};children=[];attrs={};listeners={};
 classList={toggle(){},add(){}};style={};parentElement={style:{}};
 replaceChildren(){this.children=[];} append(e){this.children.push(e);}setAttribute(k,v){this.attrs[k]=v;}focus(){}addEventListener(k,fn){this.listeners[k]=fn;}
}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function fixture(t,{connected=false,mode='matrix',replyDelay=0,zmk=false}={}){
 const ids=new Map(),events={},docEvents={},saved={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage};
 const el=id=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id)};
 globalThis.document={hidden:false,hasFocus:()=>true,getElementById:el,createElement:()=>new Element(),querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(k,fn)=>docEvents[k]=fn};
 globalThis.window={addEventListener:(k,fn)=>events[k]=fn};globalThis.localStorage={getItem:()=>'{"sound":"off","volume":20}',setItem(){}};
 el('tester-input-mode').value=mode;
 let listeners=new Set(),reads=0;
 const runtime={pending:false,broken:false,device:{opened:true,addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn),async sendReport(_,p){
 const r=new Uint8Array(32);
 if(p[0]===254){r.fill(255);r[0]=1;r[1]=0;}else{assert.deepEqual([...p.slice(0,2)],[2,3]);reads++;r[0]=2;r[1]=3;r[2]=1;}
 setTimeout(()=>{for(const fn of listeners)fn({data:new DataView(r.buffer)})},p[0]===254?0:replyDelay);
 },async close(){this.opened=false;}}};
 if(zmk)Object.assign(runtime,fakeZmk(),{protocol:'zmk',profile:{id:'zmk',name:'Agar Micro'}});
 let device=connected?runtime:null;
 const ui=setupKeyboardTester({getDevice:()=>device,getBusy:()=>false,getLayoutOptions:()=>10});
 t.after(()=>{ui.setVisible(false);for(const[k,v]of Object.entries(saved))v===undefined?delete globalThis[k]:globalThis[k]=v;});
 return {ui,el,events,docEvents,runtime,connect(){device=runtime;ui.refreshConnection()},reads:()=>reads,disconnect(){device=null;ui.refreshConnection()}};
}
test('entering browser tester starts automatically; manual pause survives refresh; returning resumes',async t=>{
 const f=fixture(t,{mode:'browser'});f.ui.setVisible(true);await delay(5);
 assert.equal(f.el('tester-toggle').textContent,'暂停检测');
 f.el('tester-toggle').onclick();f.ui.refreshConnection();await delay(5);assert.equal(f.el('tester-toggle').textContent,'继续检测');
 f.ui.setVisible(false);f.ui.setVisible(true);await delay(5);assert.equal(f.el('tester-toggle').textContent,'暂停检测');
});
test('physical tester waits for a device, then auto-starts after connection',async t=>{
 const f=fixture(t);f.ui.setVisible(true);assert.match(f.el('tester-status').textContent,/等待连接/);
 f.connect();await delay(30);assert.equal(f.el('tester-toggle').textContent,'暂停检测');assert.ok(f.reads()>0);
});
test('focus loss retains a late physical sample, then pauses within its bounded window; focus resumes',async t=>{
 const f=fixture(t,{connected:true,replyDelay:40});f.ui.setVisible(true);await delay(10);
 f.events.blur();await delay(80);assert.equal(f.el('tester-total').textContent,1);
 f.ui.refreshConnection();await delay(160);assert.equal(f.el('tester-toggle').textContent,'继续检测');
 const count=f.reads();await delay(30);assert.equal(f.reads(),count);
 f.events.focus();await delay(20);assert.equal(f.el('tester-toggle').textContent,'暂停检测');
});
test('leaving the tester invalidates in-flight initialization and cannot restart sampling',async t=>{
 const f=fixture(t,{connected:true});f.ui.setVisible(true);f.ui.setVisible(false);await delay(25);assert.equal(f.reads(),0);
});
test('tester modal permits automatic detection while another modal blocks it',async t=>{
 const f=fixture(t,{mode:'browser'});
 document.querySelector=s=>s==='dialog[open]'?{id:'tester-dialog'}:null;
 f.ui.setVisible(true);await delay(5);assert.equal(f.el('tester-toggle').textContent,'暂停检测');
 f.ui.setVisible(false);
 document.querySelector=()=>({id:'connection-dialog'});
 f.ui.setVisible(true);await delay(5);assert.equal(f.el('tester-toggle').textContent,'继续检测');
});

test('ZMK auto-starts browser output testing without issuing any QMK matrix requests',async t=>{
 const f=fixture(t,{connected:true,zmk:true});f.ui.setVisible(true);await delay(10);
 assert.equal(f.el('tester-input-mode').value,'browser');assert.equal(f.el('tester-input-mode').disabled,true);assert.equal(f.reads(),0);assert.deepEqual(f.runtime.ops,[]);
 const key=type=>({type,key:'a',code:'KeyA',preventDefault(){},stopPropagation(){}});
 f.events.keydown(key('keydown'));f.events.keydown(key('keydown'));assert.equal(f.el('tester-total').textContent,1);assert.equal(f.el('tester-held').textContent,1);
 f.events.keyup(key('keyup'));assert.equal(f.el('tester-held').textContent,0);assert.equal(f.el('tester-count').textContent,'1 / 2');
 f.events.blur();assert.equal(f.el('tester-toggle').textContent,'继续检测');
 f.events.focus();await delay(5);assert.equal(f.el('tester-toggle').textContent,'暂停检测');
 f.ui.setVisible(false);f.events.keydown(key('keydown'));assert.equal(f.el('tester-total').textContent,1);assert.equal(f.runtime.closed,false);
});

test('active test surface captures Tab and browser shortcuts; controls and pause retain normal navigation',async t=>{
 const f=fixture(t,{connected:true,zmk:true});f.ui.setVisible(true);await delay(5);
 function key(key,code,control=false){return {type:'keydown',key,code,ctrlKey:key==='f',target:{closest:()=>control?{}:null},preventDefault(){this.prevented=true},stopPropagation(){this.stopped=true}};}
 for(const e of [key('Tab','Tab'),key('f','KeyF'),{...key('Tab','Tab'),shiftKey:true}]){f.events.keydown(e);assert.equal(e.prevented,true);assert.equal(e.stopped,true);}
 const control=key('Tab','Tab',true);f.events.keydown(control);assert.equal(control.prevented,undefined);
 f.el('tester-toggle').onclick();const paused=key('Tab','Tab');f.events.keydown(paused);assert.equal(paused.prevented,undefined);
 f.ui.setVisible(false);const closed=key('f','KeyF');f.events.keydown(closed);assert.equal(closed.prevented,undefined);
});
