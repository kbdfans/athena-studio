import test from 'node:test';
import assert from 'node:assert/strict';
import {createPetPack,validatePetPack,petThemeColors,PET_PALETTES,petRgba,PET_SEQUENCES} from '../src/pet-pack.js';
import {color565,colorHex,normalizePetColors,customPetPalette,readPetColors} from '../src/pet-colors.js';

test('custom colors change only six palette bytes, preserving every sprite, timing and transparent pixel',()=>{
 const colors={body:'#C084FC',accent:'#FFF2DE',outline:'#352341'};
 const original=createPetPack(),custom=createPetPack('mint',colors);validatePetPack(custom);
 assert.equal(custom.length,original.length);
 for(let i=0;i<custom.length;i++)if(i<18||i>23)assert.equal(custom[i],original[i],`byte ${i}`);
 assert.deepEqual([...new Uint16Array(custom.buffer,16,4)],customPetPalette(colors));
 for(let a=0;a<PET_SEQUENCES.length;a++)for(let f=0;f<PET_SEQUENCES[a].length;f++){
   const old=petRgba(original,a,f),next=petRgba(custom,a,f);let visible=0;
   for(let i=0;i<old.length;i+=4){assert.equal(next[i+3],old[i+3]);if(next[i+3]){visible++;assert.ok([colors.body,colors.accent,colors.outline].map(c=>colorHex(color565(c))).includes('#'+[...next.slice(i,i+3)].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase()));}}
   assert.ok(visible>0);
 }
});
test('all preset colors round-trip to identical firmware RGB565 bytes',()=>{
 for(const name of Object.keys(PET_PALETTES))assert.deepEqual(createPetPack(name,petThemeColors(name)),createPetPack(name));
 for(let c=0;c<65536;c++)assert.equal(color565(colorHex(c)),c);
});
test('custom color validation and saved preferences reject malformed data and tolerate unavailable storage',()=>{
 const custom={body:'#c084fc',accent:'#fff2de',outline:'#352341'},fallback={theme:'mint',custom:petThemeColors()};
 assert.equal(normalizePetColors(custom).body,'#C084FC');
 for(const bad of ['', '#123', '#GGGGGG', 'red', null])assert.throws(()=>createPetPack('mint',{...custom,body:bad}));
 assert.throws(()=>createPetPack('mint',{}));
 const read=value=>readPetColors({getItem:()=>value},fallback,Object.keys(PET_PALETTES));
 assert.deepEqual(read('{bad'),fallback);assert.deepEqual(read(JSON.stringify({theme:'unknown',custom})),fallback);
 assert.deepEqual(read(JSON.stringify({theme:'custom',custom:{...custom,outline:'#12'}})),fallback);
 assert.deepEqual(read(JSON.stringify({theme:'custom',custom})),{theme:'custom',custom:normalizePetColors(custom),pattern:'original'});
 assert.deepEqual(readPetColors({getItem(){throw Error('blocked');}},fallback,[]),fallback);
});

test('every pattern preserves all 44 silhouettes, facial outlines, palette and action metadata at the same size',()=>{
 const original=createPetPack();
 for(const pattern of ['solid','tabby','cow','points']){
   const p=createPetPack('mint',undefined,pattern);validatePetPack(p);
   assert.equal(p.length,original.length);assert.deepEqual(p.slice(0,256),original.slice(0,256));
   assert.notDeepEqual(p,original);assert.deepEqual(p,createPetPack('mint',undefined,pattern));
   for(let f=0;f<44;f++)for(let i=0;i<1280;i++){
     const o=(original[256+f*320+(i>>2)]>>((i&3)*2))&3,n=(p[256+f*320+(i>>2)]>>((i&3)*2))&3;
     if(o<2)assert.equal(n,o);else assert.ok(n>0);
   }
 }
 assert.throws(()=>createPetPack('mint',undefined,'unknown'));
});

test('Shiba packs reuse PT40 layout and timing while preserving cat bytes and custom colors',()=>{
 const cat=createPetPack(),shiba=createPetPack('orange',undefined,'original','shiba');
 validatePetPack(shiba);assert.equal(shiba.length,14336);assert.deepEqual(shiba.slice(24,256),cat.slice(24,256));assert.notDeepEqual(shiba.slice(256),cat.slice(256));
 const colors={body:'#E08C35',accent:'#FFF2DE',outline:'#352341'};
 const custom=createPetPack('orange',colors,'original','shiba');assert.deepEqual(custom.slice(256),shiba.slice(256));
 for(let a=0;a<8;a++)for(let f=0;f<shiba[24+a];f++){const pixels=petRgba(shiba,a,f);assert.equal(pixels.length,5120);assert.ok(pixels.filter((n,i)=>i%4===3&&n).length>100);}
 assert.throws(()=>createPetPack('mint',undefined,'original','unknown'));
 assert.deepEqual(createPetPack(),cat);
});
test('pet preferences can use a separate species storage key without changing old cat preferences',()=>{
 const cat={theme:'gray',custom:petThemeColors('gray'),pattern:'cow'},dog={theme:'orange',custom:petThemeColors('orange'),pattern:'original'};
 const values={'athena-pet-colors-v1':JSON.stringify(cat),'athena-pet-colors-v1-shiba':JSON.stringify(dog)},storage={getItem:k=>values[k]};
 assert.deepEqual(readPetColors(storage,{},Object.keys(PET_PALETTES)),cat);
 assert.deepEqual(readPetColors(storage,{},Object.keys(PET_PALETTES),'athena-pet-colors-v1-shiba'),dog);
});
