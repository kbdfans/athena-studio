export class KeymapRuntime {
 constructor(device,profile){this.device=device;this.profile=profile;this.pending=false;this.broken=false;this.isRuntime=true;this.capabilities={screen:false};}
 static async connect(identity){const r=new KeymapRuntime(identity.device,identity.profile);await r.device.open();return r;}
 async close(){if(this.device.opened)await this.device.close();}
}
