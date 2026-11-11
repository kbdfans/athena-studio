import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyAthena } from '../src/device.js';

test('explicit connect opens the filtered picker immediately even with previous permission; cancel opens no device',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'navigator');let picks=0,lists=0;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{hid:{
   async getDevices(){lists++;throw Error('must not silently select a saved device');},
   async requestDevice(options){picks++;assert.deepEqual(options.filters,[0x2513,0x4100].map(productId=>({vendorId:0x9d5b,productId,usagePage:0xff60,usage:0x61})));return [];}
 }}});
 try{const pending=identifyAthena({prompt:true,models:["athena75","athena1800"]});assert.equal(picks,1);await assert.rejects(pending,{name:'NotFoundError'});assert.equal(lists,0);}
 finally{if(original)Object.defineProperty(globalThis,'navigator',original);else delete globalThis.navigator;}
});
