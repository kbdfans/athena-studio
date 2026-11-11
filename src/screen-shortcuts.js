export const SCREEN_SHORTCUTS = [
 {code:0x7e10,label:'动画模式',title:'切换到已保存的图片动画',category:'屏幕快捷键',minVersion:9},
 {code:0x7e11,label:'电子宠物',title:'切换到电子宠物',category:'屏幕快捷键',minVersion:9},
 {code:0x7e12,label:'击打特效',title:'切换到击打特效',category:'屏幕快捷键',minVersion:9},
];
export const screenShortcutSupported=(code,version)=>!SCREEN_SHORTCUTS.some(k=>k.code===code&&!(version>=k.minVersion));
