import {PET_PATTERNS} from './pet-patterns.js';
import {PET_COLOR_FIELDS, normalizePetColors, readPetColors, PET_COLOR_STORAGE} from './pet-colors.js';
import {PET_PALETTES, PET_SPECIES, petThemeColors, createPetPack} from './pet-pack.js';
export function setupPetColors({getBusy, onChange, onValidity, root=document}) {
  const $ = id => root.getElementById(id);
  let storage; try { storage=globalThis.localStorage; } catch {}
  let species='cat';
  try {const saved=storage?.getItem('athena-pet-species-v1');if(Object.hasOwn(PET_SPECIES,saved))species=saved;}catch{}
  const storageKey=()=>species==='cat'?PET_COLOR_STORAGE:PET_COLOR_STORAGE+'-'+species;
  const defaults=()=>({theme:PET_SPECIES[species].theme,custom:petThemeColors(PET_SPECIES[species].theme),pattern:'original'});
  const read=()=>readPetColors(storage,defaults(),Object.keys(PET_PALETTES),storageKey());
  let {theme, custom, pattern}=read();
  let colors=theme==='custom'?{...custom}:petThemeColors(theme);
  const invalid=new Set(), rows=new Map();
  const select=$('pet-theme'), status=$('pet-color-status');
  const ready=()=>invalid.size===0;
  function persist() {
    try { if(!storage)throw Error();storage.setItem(storageKey(),JSON.stringify({theme,custom,pattern}));storage.setItem('athena-pet-species-v1',species);return true; } catch { return false; }
  }
  function message(saved=true) {
    status.textContent=ready()?(saved?'所有动作同步预览 · 配色已记在此浏览器，写入后在键盘生效。':'配色已预览；浏览器无法保存，刷新后会重置。'):'请输入 # 加 6 位颜色代码，例如 #93DDAA。';
    status.classList.toggle('error',!ready());
  }
  function render() {
    select.value=theme;
    $('pet-species').value=species;
    $('pet-character-name').textContent=PET_SPECIES[species].label;
    $('pet-pattern').value=pattern;
    for(const {key} of PET_COLOR_FIELDS){const {picker,hex}=rows.get(key);picker.value=colors[key];hex.value=colors[key];hex.setAttribute('aria-invalid','false');picker.disabled=hex.disabled=pattern==='solid'&&key==='accent';}
  }
  function changed() { onChange();message(persist()); }
  for(const {key,label} of PET_COLOR_FIELDS){
    const row=root.createElement('div');row.className='pet-color-row';
    const text=root.createElement('label');text.htmlFor=`pet-color-${key}`;text.textContent=label;
    const picker=root.createElement('input');picker.type='color';picker.id=`pet-color-${key}`;picker.setAttribute('aria-label',`${label}颜色`);
    const hex=root.createElement('input');hex.type='text';hex.id=`pet-hex-${key}`;hex.maxLength=7;hex.spellcheck=false;hex.autocomplete='off';hex.setAttribute('aria-label',`${label} HEX`);hex.setAttribute('aria-describedby','pet-color-status');
    function apply(value,fromHex){
      if(getBusy())return;
      if(!/^#[0-9a-f]{6}$/i.test(value)){invalid.add(key);hex.setAttribute('aria-invalid','true');message();onValidity();return;}
      invalid.delete(key);colors={...colors,[key]:value.toUpperCase()};custom={...colors};theme='custom';select.value=theme;
      picker.value=colors[key];if(!fromHex)hex.value=colors[key];hex.setAttribute('aria-invalid','false');changed();
    }
    picker.oninput=()=>apply(picker.value,false);hex.oninput=()=>apply(hex.value,true);
    hex.onblur=()=>{if(!invalid.has(key))hex.value=colors[key];};
    row.append(picker,text,hex);$('pet-color-fields').append(row);rows.set(key,{picker,hex});
  }
  for(const [value,label] of Object.entries(PET_PATTERNS)){const option=root.createElement('option');option.value=value;option.textContent=label;$('pet-pattern').append(option);}
  $('pet-pattern').onchange=()=>{if(getBusy())return;pattern=$('pet-pattern').value;invalid.clear();render();changed();};
  select.onchange=()=>{if(getBusy())return;theme=select.value;colors=theme==='custom'?{...custom}:petThemeColors(theme);invalid.clear();render();changed();};
  $('pet-color-reset').onclick=()=>{if(getBusy())return;theme=PET_SPECIES[species].theme;pattern='original';colors=petThemeColors(theme);custom={...colors};invalid.clear();render();changed();};
  $('pet-species').onchange=()=>{if(getBusy()){$('pet-species').value=species;return;}const next=$('pet-species').value;if(!Object.hasOwn(PET_SPECIES,next))return;species=next;({theme,custom,pattern}=read());colors=theme==='custom'?{...custom}:petThemeColors(theme);invalid.clear();render();changed();};
  render();status.textContent='所有动作同步预览，写入后在键盘生效。';
  return {get species(){return species;},get valid(){return ready();},getPack(){return createPetPack(theme==='custom'?'mint':theme,theme==='custom'?normalizePetColors(colors):undefined,pattern,species);}};
}
