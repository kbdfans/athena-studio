import test from 'node:test';import assert from 'node:assert/strict';
import {translate,resolveLocale,LANGUAGES,setLocale} from '../src/i18n-core.js';
import {MESSAGES} from '../src/locales/messages.js';
import {KEYCODES,keyInfo} from '../src/keycodes.js';
import {categoryKeys} from '../src/keycode-categories.js';
import {SCREEN_SHORTCUTS,screenShortcutSupported} from '../src/screen-shortcuts.js';
import {canEnterStudio} from '../src/connection-gate.js';
test('locales use explicit matching and native labels; dynamic variables and device names stay intact',()=>{
 assert.equal(resolveLocale('zh-Hant-HK'),'zh-TW');assert.equal(resolveLocale('zh-SG'),'zh-CN');assert.equal(resolveLocale('de-DE'),'de');assert.equal(resolveLocale('pt-BR'),'en');
 for(const [locale]of LANGUAGES){const text=translate('连接你的键盘。',locale);assert(text);if(locale!=='zh-CN')assert.notEqual(text,'连接你的键盘。');assert.equal(translate('KC_A / MO(1) / Athena1800',locale),'KC_A / MO(1) / Athena1800');}
 assert.equal(translate('第 7 层','en'),'Layer 7');assert.equal(translate('颜色 4','ja'),'色 4');assert.equal(translate('连接键盘 ↗','de'),'Verbinden ↗');assert.equal(translate('图片 3','en'),'Image 3');
 for(const entries of Object.values(MESSAGES))for(const value of Object.values(entries))assert(value.trim());
});
test('localized search finds stable screen keycodes, firmware capability is required',()=>{
 setLocale('en');assert.equal(categoryKeys(KEYCODES,'basic','屏幕快捷键','keystroke effects')[0].code,0x7e12);setLocale('zh-CN');
 assert.equal(categoryKeys(KEYCODES,'basic','屏幕快捷键').length,3);for(const k of SCREEN_SHORTCUTS){assert.equal(keyInfo(k.code).label,k.label);assert(!screenShortcutSupported(k.code,8));assert(screenShortcutSupported(k.code,9));}assert(screenShortcutSupported(0x7e04,8));
});
test('connection gate requires a verified ready open runtime; disconnection cannot keep access',()=>{
 const r={isRuntime:true,broken:false,device:{opened:true}};assert(canEnterStudio(r,true));assert(!canEnterStudio(r,false));assert(!canEnterStudio(null,true));assert(!canEnterStudio({...r,broken:true},true));assert(!canEnterStudio({...r,device:{opened:false}},true));assert(!canEnterStudio({...r,isRuntime:false},true));
});

test('site defaults are host-specific; a deliberate language choice takes priority',async()=>{
 const {initialLocale}=await import('../src/i18n-core.js');
 assert.equal(initialLocale({hostname:'v.kbd.cool',browserLanguage:'zh-CN'}),'en');
 assert.equal(initialLocale({hostname:'kbd.cool',browserLanguage:'en-US'}),'zh-CN');
 assert.equal(initialLocale({hostname:'www.kbd.cool',browserLanguage:'en-US'}),'zh-CN');
 assert.equal(initialLocale({hostname:'v.kbd.cool',saved:'ja'}),'ja');
 assert.equal(initialLocale({hostname:'kbd.cool',saved:'invalid',browserLanguage:'en-US'}),'zh-CN');
 assert.equal(initialLocale({hostname:'127.0.0.1',browserLanguage:'de-DE'}),'de');
});
test('every key title, layer example and QMK setting is translated to English',async()=>{
 const {layerExample}=await import('../src/keycodes.js');const {QMK_SETTINGS}=await import('../src/qmk-settings.js');
 const texts=[...KEYCODES.flatMap(k=>[k.label,k.title,layerExample(k.code)]),...QMK_SETTINGS.flatMap(s=>[s.label,...(s.bits||[])])];
 for(const text of texts.filter(s=>typeof s==='string'))assert(!/[\u3400-\u9fff]/.test(translate(text,'en')),text);
});
test('demo gate opens without fabricating a connection; regular gate still requires a verified session',()=>{
 assert(canEnterStudio(null,false,true));assert(!canEnterStudio(null,false,false));
});
test('dynamic help preserves layer numbers, key names and progress values',()=>{
 assert.equal(translate('轻按 Space，按住第 3 层','en'),'Tap Space; hold for layer 3');
 assert.equal(translate('Athena1800 按键布局','en'),'Athena1800 key layout');
 assert.equal(translate('喷射力度 76% · 同屏 5 / 16 · 碰撞反弹','en'),'Launch force 76% · On screen 5 / 16 · Collision and bounce');
 assert.equal(translate('＋ · 数字小键盘 · ＋ · KC_KP_PLUS','en'),'＋ · Numpad · ＋ · KC_KP_PLUS');
 assert.equal(translate('Scroll up · 滚轮 ↑','en'),'Scroll up · Scroll up');
});
