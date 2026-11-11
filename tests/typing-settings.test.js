import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TYPING_DEFAULTS,normalizeTypingSettings,encodeTypingSettings,decodeTypingSettings,typingColorIndex,color565,hex565} from '../src/typing-settings.js';
import {RuntimeV2} from '../src/runtime-v2.js';
test('typing settings round-trip every color and reject malformed config',()=>{
 for(let n=0;n<65536;n++)assert.equal(color565(hex565(n)),n);
 const normalized=normalizeTypingSettings(TYPING_DEFAULTS);assert.deepEqual(decodeTypingSettings(encodeTypingSettings(normalized)),normalized);
 for(const bad of [null,{...normalized,size:3},{...normalized,weight:-1},{...normalized,mode:1.5},{...normalized,colors:['red']},{...normalized,background:'red'},{...normalized,grid:'#xxx'}])assert.throws(()=>encodeTypingSettings(bad));
 assert.throws(()=>decodeTypingSettings(new Uint8Array(12)));assert.equal(typingColorIndex('A',2),0);assert.equal(typingColorIndex('0',2),1);assert.equal(typingColorIndex('?',2),2);assert.equal(typingColorIndex('A',0,3),0);assert.equal(typingColorIndex('A',1,3),3);
});
test('config protocol uses isolated get/set operations and exact palette bytes',async()=>{
 const d=new RuntimeV2({});const calls=[];d.command=async(op,slot,opts)=>{calls.push({op,slot,opts});const r=new Uint8Array(32);r.set(encodeTypingSettings(TYPING_DEFAULTS),6);r[22]=1;return r;};
 const result=await d.typingSettings(TYPING_DEFAULTS);assert(result.dirty);assert.equal(calls[0].op,23);const bytes=encodeTypingSettings(TYPING_DEFAULTS);assert.equal(calls[0].opts.offset,new DataView(bytes.buffer).getUint32(0,true));assert.deepEqual(calls[0].opts.data,bytes.subarray(4));await d.typingSettings();assert.equal(calls[1].op,22);
});
test('all size and weight variants contain valid nonempty uppercase glyphs',()=>{
 const a=JSON.parse(readFileSync('public/typing-glyphs.json','utf8'));assert.equal(a.variants.length,9);
 for(const v of a.variants){assert.equal(v.data.length,94*v.stride);assert.equal(v.stride,v.width*v.height/4);assert(v.data.every(n=>Number.isInteger(n)&&n>=0&&n<=255));for(let c=65;c<=90;c++)assert(v.data.slice((c-33)*v.stride,(c-32)*v.stride).some(Boolean));}
 for(let size=0;size<3;size++){let previous=0;for(let weight=0;weight<3;weight++){const v=a.variants[size*3+weight];let ink=0;for(const n of v.data.slice(32*v.stride,33*v.stride))for(let b=0;b<4;b++)ink+=(n>>(2*b))&3;assert(ink>previous);previous=ink;}}
});
