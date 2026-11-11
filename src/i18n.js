import {LANGUAGES,resolveLocale,setLocale,getLocale,translate,initialLocale} from './i18n-core.js';
// Translate presentation nodes only. Form values, keycodes, user files and HID
// operations are never translated. Weak source records allow lossless switching.
export function setupLanguages(root=document){
 const sources=new WeakMap(),attributes=new WeakMap();let observer;
 let saved;try{saved=localStorage.getItem('athena-language');}catch{}
 setLocale(initialLocale({saved,hostname:location.hostname,browserLanguage:navigator.language}));
 function ignored(element){return !element||element.closest('script,style,[data-i18n-skip],.language-picker');}
 const translatedAttributes=['title','placeholder','aria-label','aria-description','alt','label'];
 function text(node){if(ignored(node.parentElement)||node.parentElement.closest('textarea'))return;let r=sources.get(node);if(!r||node.nodeValue!==r.rendered)r={source:node.nodeValue};r.rendered=translate(r.source);if(node.nodeValue!==r.rendered)node.nodeValue=r.rendered;sources.set(node,r);}
 function element(el){
  if(ignored(el))return;
  if(el.tagName==='OPTION'&&!el.hasAttribute('value'))el.setAttribute('value',el.textContent);
  let record=attributes.get(el)||{};
  for(const name of translatedAttributes){if(!el.hasAttribute(name))continue;const value=el.getAttribute(name);let r=record[name];if(!r||value!==r.rendered)r={source:value};r.rendered=translate(r.source);if(r.rendered!==value)el.setAttribute(name,r.rendered);record[name]=r;}
  attributes.set(el,record);
 }
 function walk(node){if(node.nodeType===3){text(node);return;}if(node.nodeType!==1)return;element(node);if(ignored(node))return;for(const child of node.childNodes)walk(child);}
 const options={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:translatedAttributes};
 function observe(){observer.observe(root.body,options);}
 observer=new MutationObserver(records=>{observer.disconnect();for(const r of records){if(r.type==='childList')for(const n of r.addedNodes)walk(n);else if(r.type==='characterData')text(r.target);else element(r.target);}observe();});
 const selectors=[...root.querySelectorAll('.language-picker')];
 function apply(locale,persist=true){setLocale(locale);observer.disconnect();root.documentElement.lang=getLocale();for(const s of selectors){s.value=getLocale();s.setAttribute('aria-label',translate('语言'));}walk(root.body);observe();if(persist)try{localStorage.setItem('athena-language',getLocale());}catch{}root.dispatchEvent(new CustomEvent('athena-language-change',{detail:{locale:getLocale()}}));}
 for(const s of selectors){for(const [value,label]of LANGUAGES){const o=root.createElement('option');o.value=value;o.textContent=label;s.append(o);}s.onchange=()=>apply(s.value);}
 apply(getLocale(),false);return {setLanguage:apply,getLanguage:getLocale};
}
