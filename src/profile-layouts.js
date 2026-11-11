import d75 from './athena-definition.json' with {type:'json'};
import k75 from './athena-defaults.json' with {type:'json'};
import d1800 from './athena1800-definition.json' with {type:'json'};
import k1800 from './athena1800-defaults.json' with {type:'json'};
import {keyboardLayout} from './keyboard-layout.js';
import {KEYBOARD_MM,SCREEN_POSITION} from './keyboard-geometry.js';
export function profileLayout(profile,options=profile.layoutOptions){
 const is75=profile.id==='athena75',definition=is75?d75:d1800,defaults=is75?k75:k1800;
 const keys=keyboardLayout(definition,options,profile.id);
 const board=is75?KEYBOARD_MM:{width:Math.max(...keys.map(k=>k.x+Math.max(k.w,k.x2+k.w2)))*19-1,height:Math.max(...keys.map(k=>k.y+k.h))*19-1};
 return {definition,defaults,keys,board,screen:is75?SCREEN_POSITION:null};
}
