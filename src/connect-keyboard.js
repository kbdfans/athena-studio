import {KeymapRuntime} from './keymap-runtime.js';
import {RuntimeV2} from './runtime-v2.js';
// Legacy keyboards receive no private screen commands. Screen Studio must advertise
// itself first; ASU2 and all four region checks still gate actual screen access.
export async function connectIdentifiedKeyboard(identity){
 const {profile,device,uid}=identity;
 if(profile.keymapOnly||!new RegExp(`^${profile.id==='athena1800'?'Athena1800':'Athena75'} Screen Studio v2(?:\\b|$)`).test(device.productName||identity.name||''))
  return KeymapRuntime.connect(identity);
 return RuntimeV2.tryConnect(device,uid);
}
