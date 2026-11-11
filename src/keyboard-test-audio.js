export const TEST_SOUNDS = Object.freeze({off:'关闭提示音',digital:'电子滴答',arcade:'复古 8-bit',soft:'柔和水滴'});
export function readTestAudioSettings(storage) {
  try { const value=JSON.parse(storage.getItem('athena-test-audio') || '{}');return {sound:Object.hasOwn(TEST_SOUNDS,value.sound)?value.sound:'digital',volume:Number.isFinite(value.volume)?Math.min(100,Math.max(0,value.volume)):20}; }
  catch {return {sound:'digital',volume:20};}
}
export class TestAudio {
  constructor(createContext = () => new (window.AudioContext || window.webkitAudioContext)()) {this.createContext=createContext;this.context=null;this.voices=new Set();}
  async enable() {this.context ||= this.createContext();if(this.context.state==='suspended')await this.context.resume();}
  play(sound,volume) {
    if(sound==='off'||volume<=0||!Object.hasOwn(TEST_SOUNDS,sound)||!this.context||this.context.state!=='running'||this.voices.size>=6)return;
    const c=this.context,osc=c.createOscillator(),gain=c.createGain(),now=c.currentTime;
    const preset={digital:['square',1100,620,.045,.08],arcade:['square',740,1480,.075,.065],soft:['sine',880,440,.10,.16]}[sound];
    osc.type=preset[0];osc.frequency.setValueAtTime(preset[1],now);osc.frequency.exponentialRampToValueAtTime(preset[2],now+preset[3]);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,Math.min(100,volume)/100*preset[4]),now+.003);gain.gain.exponentialRampToValueAtTime(.0001,now+preset[3]);
    osc.connect(gain);gain.connect(c.destination);this.voices.add(osc);
    osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(osc);};osc.start(now);osc.stop(now+preset[3]+.01);
  }
}
