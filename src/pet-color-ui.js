import {PET_PATTERNS} from './pet-patterns.js';
import {PET_COLOR_FIELDS, normalizePetColors, readPetColors, PET_COLOR_STORAGE} from './pet-colors.js';
import {PET_PALETTES, PET_SPECIES, petThemeColors, createPetPack, petRgba, petRequiresUpgrade} from './pet-pack.js';
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
  const status=$('pet-color-status');
  const speciesInputs = new Map();
  let model, motionVersion;
  const requiresUpgrade = (value = species) => petRequiresUpgrade(PET_SPECIES[value], model, motionVersion);
  const ready=()=>invalid.size===0;
  for (const [value, {label, theme: defaultTheme}] of Object.entries(PET_SPECIES)) {
    const card = root.createElement('label');
    const radio = root.createElement('input');
    radio.type = 'radio';
    radio.name = 'pet-species';
    radio.value = value;
    const content = root.createElement('span');
    const canvas = root.createElement('canvas');
    canvas.width = 40;
    canvas.height = 32;
    canvas.setAttribute('aria-hidden', 'true');
    const pixels = petRgba(createPetPack(defaultTheme, undefined, 'original', value), 0, 0);
    canvas.getContext('2d').putImageData(new ImageData(pixels, 40, 32), 0, 0);
    const name = root.createElement('span');
    name.textContent = label;
    const requirement = root.createElement('small');
    requirement.textContent = '需升级固件';
    requirement.hidden = true;
    content.append(canvas, name, requirement);
    card.append(radio, content);
    $('pet-species').append(card);
    speciesInputs.set(value, radio);
    radio.onchange = () => {
      if (getBusy() || requiresUpgrade(value)) {
        speciesInputs.get(species).checked = true;
        return;
      }
      species = value;
      ({theme, custom, pattern} = read());
      colors = theme === 'custom' ? {...custom} : petThemeColors(theme);
      invalid.clear();
      render();
      changed();
    };
  }
  const rail = $('pet-species');
  const previous = $('pet-species-prev'), next = $('pet-species-next');
  function updateNavigation() {
    const max = rail.scrollWidth - rail.clientWidth;
    previous.parentElement.hidden = max <= 1;
    previous.disabled = rail.scrollLeft <= 1;
    next.disabled = rail.scrollLeft >= max - 1;
  }
  function browse(direction) {
    const card = rail.firstElementChild;
    const step = card.offsetWidth + parseFloat(getComputedStyle(rail).columnGap);
    const count = Math.max(1, Math.floor(rail.clientWidth / step));
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    rail.scrollBy({left: direction * step * count, behavior});
  }
  previous.onclick = () => browse(-1);
  next.onclick = () => browse(1);
  rail.addEventListener('scroll', updateNavigation, {passive: true});
  new ResizeObserver(updateNavigation).observe(rail);
  updateNavigation();
  function persist() {
    try { if(!storage)throw Error();storage.setItem(storageKey(),JSON.stringify({theme,custom,pattern}));storage.setItem('athena-pet-species-v1',species);return true; } catch { return false; }
  }
  function message(saved=true) {
    status.textContent=ready()?(saved?'所有动作同步预览 · 配色已记在此浏览器，写入后在键盘生效。':'配色已预览；浏览器无法保存，刷新后会重置。'):'请输入 # 加 6 位颜色代码，例如 #93DDAA。';
    status.classList.toggle('error',!ready());
  }
  const themeLabels = {mint:'薄荷', orange:'暖橘', cream:'奶油', gray:'雾灰', custom:'自定义配色'};
  function renderOptions(id, options, choose, current) {
    const inputs = new Map();
    for (const [value, name] of Object.entries(options)) {
      const label = root.createElement('label');
      const radio = root.createElement('input');
      radio.type = 'radio';
      radio.name = id;
      radio.value = value;
      const text = root.createElement('span');
      text.textContent = name;
      label.append(radio, text);
      $(id).append(label);
      inputs.set(value, radio);
      radio.onchange = () => {
        if (getBusy()) {
          inputs.get(current()).checked = true;
          return;
        }
        choose(value);
        invalid.clear();
        render();
        changed();
      };
    }
    return inputs;
  }
  const themes = renderOptions('pet-theme', themeLabels, value => {
    theme = value;
    colors = theme === 'custom' ? {...custom} : petThemeColors(theme);
  }, () => theme);
  const patterns = renderOptions('pet-pattern', PET_PATTERNS, value => {
    pattern = value;
  }, () => pattern);
  function render() {
    themes.get(theme).checked = true;
    speciesInputs.get(species).checked = true;
    $('pet-character-name').textContent=PET_SPECIES[species].label;
    patterns.get(pattern).checked = true;
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
      invalid.delete(key);colors={...colors,[key]:value.toUpperCase()};custom={...colors};theme='custom';themes.get(theme).checked = true;
      picker.value=colors[key];if(!fromHex)hex.value=colors[key];hex.setAttribute('aria-invalid','false');changed();
    }
    picker.oninput=()=>apply(picker.value,false);hex.oninput=()=>apply(hex.value,true);
    hex.onblur=()=>{if(!invalid.has(key))hex.value=colors[key];};
    row.append(picker,text,hex);$('pet-color-fields').append(row);rows.set(key,{picker,hex});
  }
  $('pet-color-reset').onclick=()=>{if(getBusy())return;theme=PET_SPECIES[species].theme;pattern='original';colors=petThemeColors(theme);custom={...colors};invalid.clear();render();changed();};
  function updateCompatibility(profileId, version) {
    model=profileId;motionVersion=version;
    for (const [value, radio] of speciesInputs) {
      const locked=requiresUpgrade(value);
      radio.disabled=locked||getBusy();
      radio.parentElement.classList.toggle('requires-upgrade',locked);
      radio.parentElement.querySelector('small').hidden=!locked;
    }
  }
  render();updateCompatibility();status.textContent='所有动作同步预览，写入后在键盘生效。';
  return {updateCompatibility,get requiresUpgrade(){return requiresUpgrade();},get species(){return species;},get valid(){return ready();},getPack(){return createPetPack(theme==='custom'?'mint':theme,theme==='custom'?normalizePetColors(colors):undefined,pattern,species);}};
}
