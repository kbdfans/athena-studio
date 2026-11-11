// Compile the production protocol engine against RAM-backed platform hooks.
#include "screen_upload.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
static uint8_t flash[0x1000000],p[32],fixture[100000];
static unsigned erases,writes,clock_ms;static bool paused,fail_write;static uint32_t fixture_size;
const uint8_t *su_flash_ptr(uint32_t offset){assert(offset<sizeof flash);return flash+offset;}
bool su_flash_erase(uint32_t offset){assert(offset>=0xc00000&&offset<0xe00000&&offset%4096==0);erases++;memset(flash+offset,255,4096);return true;}
bool su_flash_program(uint32_t offset,const uint8_t data[256]){
    assert(offset>=0xc00000&&offset<0xe00000&&offset%256==0);if(fail_write)return false;writes++;
    for(int i=0;i<256;i++){assert((flash[offset+i]&data[i])==data[i]);flash[offset+i]&=data[i];}return true;
}
void su_display_pause(bool value){paused=value;}
void su_display_recover(void){}
uint32_t su_millis(void){return clock_ms;}
static void put32(uint8_t *d,uint32_t n){for(int i=0;i<4;i++)d[i]=n>>(8*i);}
static void packet(uint8_t op){memset(p,0,32);p[0]=0xfd;p[1]=0xa7;p[2]=op;p[4]=5;}
static uint8_t send(void){su_receive(p);return p[5];}
static void reset(void){packet(SU_ABORT);send();memset(flash,0x55,sizeof flash);erases=writes=clock_ms=0;fail_write=false;}
static void begin(uint32_t crc){packet(SU_BEGIN);put32(p+6,fixture_size);put32(p+10,crc);assert(send()==SU_OK);assert(paused);}
static uint8_t data_until(uint32_t start,uint32_t end){
    while(start<end){uint32_t n=end-start;if(n>22)n=22;packet(SU_DATA);p[5]=n;put32(p+6,start);memcpy(p+10,fixture+start,n);uint8_t s=send();if(s)return s;start+=n;}return 0;
}
int main(int argc,char **argv){
    assert(argc==2);FILE *f=fopen(argv[1],"rb");assert(f);fixture_size=fread(fixture,1,sizeof fixture,f);fclose(f);assert(fixture_size>32768);
    uint32_t crc=su_crc32(0xffffffffu,fixture,fixture_size)^0xffffffffu;
    reset();packet(SU_INFO);assert(send()==SU_OK&&!memcmp(p+6,"ASU1",4));
    packet(SU_BEGIN);p[4]=6;assert(send()==SU_RANGE&&erases==0);
    packet(SU_BEGIN);put32(p+6,0x200001);assert(send()==SU_RANGE&&erases==0);
    packet(SU_READ);put32(p+6,0x1fffff);p[5]=24;assert(send()==SU_RANGE);
    begin(crc);packet(SU_BEGIN);put32(p+6,fixture_size);assert(send()==SU_BUSY);
    packet(SU_RECOVER);assert(send()==SU_BUSY);
    packet(SU_DATA);put32(p+6,2);p[5]=1;assert(send()==SU_ORDER&&erases==0);
    assert(data_until(0,256)==0&&erases==0);assert(data_until(256,fixture_size)==0);
    assert(flash[0xc00000]==255);packet(SU_COMMIT);assert(send()==0&&!paused);
    assert(!memcmp(flash+0xc00000,fixture,fixture_size));
    for(unsigned i=0;i<0xc00000;i++)assert(flash[i]==0x55);
    for(unsigned i=0xc00000+((fixture_size+4095)&~4095u);i<sizeof flash;i++)assert(flash[i]==0x55);
    reset();begin(crc^1);assert(data_until(0,fixture_size)==0);packet(SU_COMMIT);assert(send()==SU_CRC&&flash[0xc00000]==255&&!paused);
    reset();begin(crc);assert(data_until(0,fixture_size)==0);flash[0xc00200]^=1;packet(SU_COMMIT);assert(send()==SU_CRC&&flash[0xc00000]==255);
    reset();uint8_t save=fixture[0];fixture[0]=0x11;begin(crc);assert(data_until(0,256)==SU_FORMAT&&erases==0&&!paused);fixture[0]=save;
    reset();begin(crc);fail_write=true;assert(data_until(0,512)==SU_FLASH&&erases==1&&!paused);
    reset();begin(crc);assert(data_until(0,256)==0);clock_ms=15001;su_task();assert(!paused&&erases==0);packet(SU_COMMIT);assert(send()==SU_ORDER);
    reset();begin(crc);assert(data_until(0,512)==0);packet(SU_ABORT);p[4]=4;assert(send()==SU_ORDER&&paused);packet(SU_ABORT);assert(send()==SU_OK&&!paused&&flash[0xc00000]==255);
    reset();packet(SU_READ);put32(p+6,0x1fffff);p[5]=1;assert(send()==SU_OK&&p[6]==0x55);
    puts("PASS: protocol identity, bounds, ordering, busy, header-last commit, untouched neighbors, CRC, readback corruption, format, flash failure, timeout");
}
