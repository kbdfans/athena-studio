#include "screen_keys.h"
#include "pet.h"
#include "typing.h"
#include "screen_upload.h"
#include <stdio.h>
#include <string.h>
#include <assert.h>
static uint8_t flash[0x1000000],packet[32],fixture[40000];
static uint32_t now;static unsigned erases,writes;static bool fail_write;
const uint8_t *su_flash_ptr(uint32_t offset){assert(offset<sizeof flash);return flash+offset;}
bool su_flash_erase(uint32_t offset){assert(offset>=0x400000&&offset<0xe00000&&offset%4096==0);erases++;memset(flash+offset,255,4096);return true;}
bool su_flash_program(uint32_t offset,const uint8_t page[256]){assert(offset>=0x400000&&offset<0xe00000&&offset%256==0);writes++;if(fail_write){memcpy(flash+offset,page,16);return false;}for(int i=0;i<256;i++){assert((flash[offset+i]&page[i])==page[i]);flash[offset+i]&=page[i];}return true;}
uint32_t su_millis(void){return now;}
uint32_t su_micros(void){return now*1000;}
bool su_flash_program_range(uint32_t offset,const uint8_t *data,uint32_t length){assert(length&&length<=4096&&length%256==0&&offset+length<=0xdfe000);for(unsigned i=0;i<length;i+=256)if(!su_flash_program(offset+i,data+i))return false;return true;}
bool su_flash_erase_range(uint32_t offset,uint32_t length){assert(length==4096||length==65536);assert(offset%length==0&&offset+length<=0xdfe000);for(unsigned i=0;i<length;i+=4096)assert(su_flash_erase(offset+i));return true;}
void su_display_pause(bool v){(void)v;}
void su_display_recover(void){}
static void put32(uint8_t *p,uint32_t n){for(int i=0;i<4;i++)p[i]=n>>(i*8);}
static uint8_t cmd(unsigned op,unsigned value){memset(packet,0,32);pet_command(op,value,packet);return packet[5];}
static pet_status_t status(void){pet_status_t s;pet_status(&s);return s;}
static void upload(unsigned slot,unsigned size){
 memset(packet,0,32);packet[2]=SU_BEGIN;packet[4]=slot;put32(packet+6,size);put32(packet+10,su_crc32(0xffffffffu,fixture,size)^0xffffffffu);su_receive(packet);assert(packet[5]==0);
 for(unsigned off=0;off<size;off+=22){unsigned n=size-off>22?22:size-off;memset(packet,0,32);packet[2]=SU_DATA;packet[4]=slot;packet[5]=n;put32(packet+6,off);memcpy(packet+10,fixture+off,n);su_receive(packet);assert(packet[5]==0);}
 unsigned base=slot==3?0xa00000:0x400000;assert(flash[base]==255);
 memset(packet,0,32);packet[2]=SU_COMMIT;packet[4]=slot;su_receive(packet);assert(packet[5]==0);assert(!memcmp(flash+base,fixture,size));
}
static void seed_care(uint32_t xp,uint8_t hp,uint32_t start){
 uint8_t *p=flash+0xdfe000;memset(p,255,8192);memcpy(p,"PET2",4);put32(p+4,1);put32(p+8,xp);put32(p+12,0);p[16]=1;p[17]=0;p[18]=hp;p[19]=2;put32(p+20,su_crc32(0xffffffffu,p,20)^0xffffffffu);now=start;pet_init();
}
// Keep awake without adding typing XP, using the same pet-mode command as the UI.
static void awake_for(uint32_t ms){
 while(ms){uint32_t step=ms>20000?20000:ms;cmd(17,1);now+=step;pet_tick();ms-=step;}
}
static void care_tests(void){
 // Exact active hunger boundary and floor; no real-time waits.
 seed_care(10,0,0);awake_for(599999);assert(status().xp==10);now++;pet_tick();assert(status().xp==9);awake_for(600000);assert(status().xp==8);
 seed_care(0,0,0);awake_for(6000000);assert(status().xp==0&&status().fullness==0);
 // HP reaches zero after five awake minutes; starvation starts at that boundary.
 seed_care(10,1,0);awake_for(899999);assert(status().fullness==0&&status().xp==10);now++;pet_tick();assert(status().xp==9);
 // Feeding resets hunger and the idle HP timer, even at the next timer boundary.
 seed_care(10,0,0);awake_for(599999);cmd(18,0);now++;pet_tick();assert(status().xp==10&&status().fullness==20);
 // An unattended night charges only the 30 awake seconds before sleep. Both
 // normal ticks and a single delayed tick must protect XP and HP overnight.
 seed_care(10,80,0);now=28800000;pet_tick();assert(status().action==3&&status().xp==10&&status().fullness==80);
 now+=28800000;pet_tick();assert(status().xp==10&&status().fullness==80);
 seed_care(10,0,0);awake_for(570000);cmd(17,1);now+=29999;pet_tick();assert(status().xp==10);now++;pet_tick();assert(status().xp==9&&status().action==3);
 for(unsigned i=0;i<480;i++){now+=60000;pet_tick();}assert(status().xp==9);
 // Waking resumes the partial hunger interval, without charging sleep duration.
 seed_care(10,0,0);awake_for(300000);cmd(17,1);now+=28800000;pet_tick();assert(status().xp==10);awake_for(269999);assert(status().xp==10);now++;pet_tick();assert(status().xp==9);
 // Image mode and power-off pause all care timers and preserve partial progress.
 seed_care(10,0,0);awake_for(300000);cmd(20,0);now+=7200000;pet_tick();assert(status().xp==10);cmd(17,1);awake_for(299999);assert(status().xp==10);now++;pet_tick();assert(status().xp==9);
 seed_care(10,0,0);awake_for(300000);cmd(21,0);pet_tick();now+=7200000;pet_init();awake_for(299999);assert(status().xp==10);now++;pet_tick();assert(status().xp==9);
 seed_care(10,0,0xfffffff0u);awake_for(600000);assert(status().xp==9);
 // Sleep across uint32 clock wrap also remains free of offline penalties.
 seed_care(10,0,0xfffffff0u);now+=28800000;pet_tick();assert(status().xp==10&&status().action==3);
 // Typing mode pauses pet growth/HP, rejects pet interactions and persists.
 seed_care(200,80,0);assert(cmd(17,2)==0);pet_tick();now+=28800000;pet_key(true);pet_tick();assert(status().xp==200&&status().fullness==80&&status().keys==0);assert(cmd(18,0)==SU_ORDER&&cmd(19,0)==SU_ORDER);cmd(21,0);pet_tick();pet_init();assert(status().mode==2);assert(cmd(17,1)==0);
 // Only sustained running time costs HP; no charge for a long idle gap after a short run.
 seed_care(200,80,0);for(unsigned i=0;i<620;i++){now+=100;pet_key(false);pet_tick();}assert(status().fullness==79);
 cmd(21,0);pet_tick();pet_init();assert(status().fullness==79);
 seed_care(200,80,0);for(unsigned i=0;i<10;i++){now+=100;pet_key(false);pet_tick();}now+=61000;pet_tick();assert(status().fullness==80);
 // Save and resume a partial run, rather than resetting its budget on reboot.
 seed_care(200,80,0);for(unsigned i=0;i<320;i++){now+=100;pet_key(false);pet_tick();}cmd(21,0);pet_tick();pet_init();
 for(unsigned i=0;i<320;i++){now+=100;pet_key(false);pet_tick();}assert(status().fullness==79);
 // An actual key wakes the cat after a night, adds only the usual one typing XP.
 seed_care(10,0,0);now+=28800000;pet_tick();pet_key(false);pet_tick();assert(status().action==7&&status().xp==11&&status().fullness==0);
 // Dropping XP updates derived level/stage without unsigned underflow.
 seed_care(200,0,0);awake_for(600000);assert(status().xp==199&&status().level==1&&status().stage==1);
 // Repeated space during one jump cannot charge multiple jumps. Charge on the fifth landing.
 seed_care(200,80,0);
 for(unsigned j=0;j<5;j++){pet_key(true);pet_tick();assert(status().action==6);for(unsigned i=0;i<9;i++){now+=100;pet_key(true);pet_tick();}now+=200;pet_tick();assert(status().fullness==(j<4?80:79));}
 // Cancelled jump via feeding never counts; preserve completed-jump remainder across reboot.
 seed_care(200,80,0);pet_key(true);now+=100;cmd(18,0);now+=2000;pet_tick();assert(status().fullness==100);
 seed_care(200,80,0);for(unsigned j=0;j<4;j++){pet_key(true);now+=1100;pet_tick();}cmd(21,0);pet_tick();pet_init();pet_key(true);now+=1100;pet_tick();assert(status().fullness==79);
 puts("PASS care: hunger/feed/reset, overnight sleep and wake boundaries, image pause, journal and offline preservation, rollover, running and completed jumps");
}
static void config_tests(void){
 seed_care(2059,85,0);typing_settings defaults,settings,actual;typing_settings_default(&defaults);settings=defaults;settings.size=2;settings.weight=0;settings.mode=2;settings.colors[0]=0xf800;settings.colors[1]=0x07e0;settings.colors[2]=0x001f;settings.background=0x1234;settings.grid=0x5678;
 memset(packet,0,32);packet[2]=23;memcpy(packet+6,&settings,sizeof(typing_settings));su_receive(packet);assert(packet[5]==SU_OK);assert(!memcmp(packet+6,&settings,sizeof(typing_settings)));assert(status().dirty);
 now=1499;pet_tick();assert(status().dirty);now=2100;pet_tick();assert(!status().dirty);pet_init();typing_settings_get(&actual);assert(!memcmp(&actual,&settings,sizeof(typing_settings)));assert(status().xp==2059&&status().fullness==85);
 // Invalid settings never change configuration or journal state.
 settings.size=3;memset(packet,0,32);packet[2]=23;memcpy(packet+6,&settings,sizeof(typing_settings));su_receive(packet);assert(packet[5]==SU_RANGE);typing_settings_get(&settings);assert(!memcmp(&settings,&actual,sizeof(typing_settings)));
 memset(packet,0,32);packet[2]=22;su_receive(packet);assert(packet[5]==0&&!memcmp(packet+6,&actual,sizeof(typing_settings)));
 // Corrupt only the TYPE extension: preserve base progression and fall back safely.
 flash[0xdfe000+256+52]^=1;pet_init();typing_settings_get(&actual);assert(!memcmp(&actual,&defaults,sizeof(typing_settings)));assert(status().xp==2059&&status().fullness==85);
 // Bursts debounce into one save; an interrupted write retains the previous record.
 unsigned before=writes;for(unsigned i=0;i<8;i++){now+=200;settings=defaults;settings.weight=i%2;memset(packet,0,32);pet_typing_config(23,(uint8_t*)&settings,packet);pet_tick();}assert(writes==before);
 now+=2100;fail_write=true;pet_tick();assert(status().save_error);fail_write=false;pet_init();typing_settings_get(&actual);assert(!memcmp(&actual,&defaults,sizeof(typing_settings)));assert(status().xp==2059);
 puts("PASS typing configuration: set/get validation, automatic debounce/save, reboot persistence, CRC fallback and torn-write preservation");
}
int main(int argc,char **argv){
 assert(argc==3);memset(flash,255,sizeof flash);now=0;pet_init();assert(status().level==1&&status().mode==0);
 assert(cmd(17,3)==SU_RANGE&&cmd(20,3)==SU_RANGE);assert(cmd(18,0)==SU_ORDER);
 assert(cmd(17,1)==0);pet_tick();assert(status().mode==1&&status().dirty==0&&writes==1);
 for(unsigned i=1;i<=12;i++){now=i*100;pet_key(false);pet_tick();}assert(status().keys==12&&status().xp==1&&status().action==2);
 now+=30001;pet_tick();assert(status().action==3);
 assert(cmd(18,0)==0);pet_tick();assert(status().action==4&&status().fullness==100);
 assert(cmd(19,0)==0);pet_tick();assert(status().action==5);
 assert(cmd(21,0)==0);pet_tick();pet_init();assert(status().mode==1&&status().keys==12&&status().xp==1&&status().fullness==100);
 assert(cmd(20,2)==0);pet_tick();pet_init();assert(status().mode==0&&status().image==2);
 // Interrupted record is ignored; the prior committed state remains recoverable.
 assert(cmd(17,1)==0);fail_write=true;pet_tick();assert(status().save_error);fail_write=false;pet_init();assert(status().mode==0);
 for(unsigned i=0;i<40;i++){assert(cmd(20,i%3)==0);pet_tick();pet_init();assert(status().image==i%3);}
 assert(erases>=2&&erases<=3);
 for(unsigned i=0;i<0x400000;i++)assert(flash[i]==255);
 // Timer rollover and idle state.
 now=0xfffffff0u;pet_init();cmd(17,1);pet_tick();now=0x8000u;pet_tick();assert(status().action==3);
 // Sustained typing must not return to walk when crossing the old 2-second window.
 cmd(17,1);now+=1000;
 for(unsigned i=0;i<24;i++){now+=100;pet_key(false);pet_tick();if(i>=8)assert(status().action==2);}
 pet_key(true);pet_tick();now+=490;pet_tick();assert(status().jump==24&&status().action==6);
 pet_key(true);now+=560;pet_tick();assert(status().jump==0&&status().action!=6);
 now+=1000;pet_tick();assert(status().action==0);
 // Growth derives from existing XP; the journal layout remains readable after reboot.
 while(status().xp<200){now+=1000;pet_key(false);pet_tick();if(status().xp>=10&&status().xp<200)assert(status().stage==1);}
 assert(status().stage==2);cmd(21,0);pet_tick();pet_init();assert(status().stage==2&&status().xp==200);
 now+=30001;pet_tick();assert(status().action==3); // Sleep also works immediately after restart.
 care_tests();
 config_tests();
 seed_care(2059,85,0);
 for(unsigned mode=0;mode<3;mode++){assert(screen_mode_key(0x7e10+mode,true));assert(status().mode==mode);pet_tick();assert(screen_mode_key(0x7e10+mode,false));pet_init();assert(status().mode==mode);assert(status().xp==2059&&status().fullness==85);}
 assert(!screen_mode_key(0x7e06,true));assert(!screen_mode_key(4,true));assert(!screen_mode_key(0x7e13,true));
 puts("PASS dedicated screen keys: three modes, release consumption, persistence, unchanged XP/HP and no LCD-type code collision");
 // Exact format validation and commit-last upload for image and pet partitions.
 FILE *f=fopen(argv[1],"rb");assert(f);unsigned n=fread(fixture,1,sizeof fixture,f);fclose(f);upload(0,n);
 f=fopen(argv[2],"rb");assert(f);n=fread(fixture,1,sizeof fixture,f);fclose(f);assert(n==14336&&pet_pack_header_valid(fixture));
 assert(pet_frame(fixture,0,649)==0&&pet_frame(fixture,0,650)==1&&pet_frame(fixture,0,2200)==0);
 assert(pet_frame(fixture,6,9999)==7);
 assert(pet_frame(fixture,2,95)==1);fixture[96]=fixture[97]=0;assert(!pet_pack_header_valid(fixture));fixture[96]=0x8a;fixture[97]=2;
 fixture[32]=44;assert(!pet_pack_header_valid(fixture));fixture[32]=36;
 fixture[24]=9;assert(!pet_pack_header_valid(fixture));fixture[24]=4;
 upload(3,n);
 memset(packet,0,32);packet[2]=SU_BEGIN;packet[4]=4;su_receive(packet);assert(packet[5]==SU_RANGE);
 memset(packet,0,32);packet[2]=SU_READ;packet[4]=3;packet[5]=24;put32(packet+6,0x3fdff0);su_receive(packet);assert(packet[5]==SU_RANGE);
 for(unsigned i=0xe00000;i<sizeof flash;i++)assert(flash[i]==255);
 puts("PASS v2: key-rate XP, actions, mode selection, sleep, rollover, save journal rotation, torn-write recovery, bounds, image/pet commit-last uploads");
}
