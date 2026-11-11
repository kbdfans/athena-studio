import {EN_PATTERNS} from './locales/templates-en.js';
import {MESSAGES} from './locales/messages.js';
export const LANGUAGES=[['zh-CN','简体中文'],['zh-TW','繁體中文'],['en','English'],['ja','日本語'],['ko','한국어'],['de','Deutsch'],['fr','Français'],['es','Español']];
export function resolveLocale(value='en'){
 const s=String(value).toLowerCase();if(s.startsWith('zh'))return /tw|hk|mo|hant/.test(s)?'zh-TW':'zh-CN';
 return LANGUAGES.find(([id])=>id===s.split('-')[0])?.[0]||'en';
}
export function initialLocale({saved,hostname='',browserLanguage='en'}={}){
 if(saved&&LANGUAGES.some(([id])=>id===saved))return saved;
 const host=hostname.toLowerCase();
 if(host==='v.kbd.cool')return 'en';
 if(host==='kbd.cool'||host==='www.kbd.cool')return 'zh-CN';
 return resolveLocale(browserLanguage);
}
let language='zh-CN';
export const getLocale=()=>language;
export function setLocale(value){language=resolveLocale(value);return language;}
const words={layer:['Layer','層','レイヤー','레이어','Ebene','Couche','Capa'],color:['Color','顏色','色','색상','Farbe','Couleur','Color'],original:['Original','原值','元の値','원래 값','Original','Original','Original'],key:['Key','按鍵','キー','키','Taste','Touche','Tecla'],letters:['Letter','字母','英字','문자','Buchstabe','Lettre','Letra'],numbers:['Number','數字','数字','숫자','Zahl','Chiffre','Número']};
function word(id,locale){return words[id][['en','zh-TW','ja','ko','de','fr','es'].indexOf(locale)];}
export function translate(text,locale=language){
 if(typeof text!=='string'||locale==='zh-CN')return text;
 const original=text,s=text.trim().replace(/\s+/g,' ');if(!s)return text;
 const entry=MESSAGES[s];let translated=entry?.[locale]||entry?.en;
 if(!translated){
  if(s.includes('。例：'))translated=s.split('。例：').map(p=>translate(p,locale)).join('. Example: ');
  else {for(const pattern of EN_PATTERNS){const match=s.match(pattern.regex);if(match){translated=pattern.target.replace(/\{(\d+)\}/g,(_,index)=>translate(match[Number(index)+1],locale));break;}}}
 }
 if(!translated){
  let m;
  if(s.includes(' — '))translated=s.split(' — ').map(p=>translate(p,locale)).join(' — ');
  else if(s.startsWith('— '))translated='— '+translate(s.slice(2),locale);
  else if(s.includes(' · '))translated=s.split(' · ').map(p=>translate(p,locale)).join(' · ');
  else if(s.startsWith('· '))translated='· '+translate(s.slice(2),locale);
  else if((m=s.match(/^第 (\d+) 层(.*)$/)))translated=word('layer',locale)+' '+m[1]+(m[2].startsWith(' · ')?' · '+translate(m[2].slice(3),locale):translate(m[2],locale));
  else if((m=s.match(/^按键 (.+)，第 (\d+) 层，(.+)$/)))translated=word('key',locale)+' '+translate(m[1],locale)+', '+word('layer',locale)+' '+m[2]+', '+translate(m[3],locale);
  else if((m=s.match(/^赋予 (.+)$/)))translated=translate(m[1],locale);
  else if((m=s.match(/^颜色 (\d+)$/)))translated=word('color',locale)+' '+m[1];
  else if((m=s.match(/^字母 ([A-Z])$/)))translated=word('letters',locale)+' '+m[1];
  else if((m=s.match(/^数字 (\d)$/)))translated=word('numbers',locale)+' '+m[1];
  else if((m=s.match(/^(原值|当前)：(.*)$/)))translated=word('original',locale)+': '+translate(m[2],locale);
  else if((m=s.match(/^图片 (\d+)(.*)$/)))translated=translate('图片',locale)+' '+m[1]+translate(m[2],locale);
  else if((m=s.match(/^功能键 (F\d+)$/)))translated=m[1];
  else if((m=s.match(/^(\d+(?:\.\d+)?) 秒$/)))translated=m[1]+' s';
  else if((m=s.match(/^([✓＋+◡♡↶]\s*)(.+)$/)))translated=m[1]+translate(m[2],locale);
  else if((m=s.match(/^(.+?)(\s*[↗↑↓→♪。])$/)))translated=translate(m[1],locale)+m[2];
  else if(s.includes(' · '))translated=s.split(' · ').map(p=>translate(p,locale)).join(' · ');
  else if(s.endsWith('…'))translated=translate(s.slice(0,-1),locale)+'…';
  else if(s.includes('\n'))translated=s.split('\n').map(p=>translate(p,locale)).join('\n');
 }
 return translated?original.slice(0,original.indexOf(original.trim()))+translated+original.slice(original.trimEnd().length):original;
}
export function searchText(key){return `${key.label} ${key.title} ${key.name||''} ${translate(key.label)} ${translate(key.title)} ${key.code.toString(16)}`.toLowerCase();}
