#include "screen_upload.h"
#include "studio_release.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
static uint8_t flash[0x1000000], snapshot[0x1000000], image[0x200000], packet[32];
static uint32_t range_base=0x400000;
static unsigned erases,writes,small_erases,big_erases;static bool fail_write,fail_erase;
const uint8_t *su_flash_ptr(uint32_t offset){assert(offset<sizeof flash);return flash+offset;}
bool su_flash_erase(uint32_t offset){assert(offset>=0x400000&&offset<0xe00000&&offset%4096==0);erases++;memset(flash+offset,255,4096);return true;}
bool su_flash_program(uint32_t offset,const uint8_t page[256]){assert(offset>=0x400000&&offset<0xe00000&&offset%256==0);writes++;if(fail_write)return false;for(int i=0;i<256;i++)flash[offset+i]&=page[i];return true;}
uint32_t su_millis(void){return 0;}
uint32_t su_micros(void){return 0;}
bool su_flash_program_range(uint32_t offset,const uint8_t *data,uint32_t length){assert(length&&length<=4096&&length%256==0&&offset>=range_base&&offset+length<=range_base+0x200000);for(unsigned i=0;i<length;i+=256)if(!su_flash_program(offset+i,data+i))return false;return true;}
bool su_flash_erase_range(uint32_t offset,uint32_t length){assert(length==4096||length==65536);assert(offset%length==0&&offset>=range_base&&offset+length<=range_base+0x200000);if(fail_erase)return false;if(length==65536)big_erases++;else small_erases++;for(unsigned i=0;i<length;i+=4096)assert(su_flash_erase(offset+i));return true;}
void su_display_pause(bool value){(void)value;}
void su_display_recover(void){}
static void put32(uint8_t *p,uint32_t n){for(int i=0;i<4;i++)p[i]=n>>(8*i);}
static uint32_t crc(const uint8_t *p,unsigned n){return su_crc32(0xffffffffu,p,n)^0xffffffffu;}
static unsigned command(unsigned op,unsigned slot,unsigned offset){memset(packet,0,32);packet[2]=op;packet[4]=slot;put32(packet+6,offset);su_receive(packet);return packet[5];}
static void begin(unsigned size,bool corrupt_crc){memset(packet,0,32);packet[2]=SU_BEGIN;put32(packet+6,size);put32(packet+10,crc(image,size)^corrupt_crc);su_receive(packet);assert(!packet[5]);}
static uint8_t *stage(unsigned offset,unsigned n){uint8_t *b=su_feature_buffer();assert(b);memset(b,0,SU_FEATURE_SIZE);b[0]=0xfd;b[1]=0xa8;b[2]=1;put32(b+4,offset);b[8]=n&255;b[9]=n>>8;memcpy(b+16,image+offset,n);put32(b+12,crc(b+16,n));su_feature_received();assert(!su_feature_buffer());return b;}
static void send_image(unsigned size){for(unsigned off=0;off<size;off+=SU_BLOCK_DATA){unsigned n=size-off>SU_BLOCK_DATA?SU_BLOCK_DATA:size-off;stage(off,n);assert(command(SU_BLOCK,0,off)==SU_OK);}}
int main(int argc,char **argv){

#ifdef ATHENA_RELEASE_PID
 assert(command(14,0,0)==SU_OK);assert(!memcmp(packet+6,"ASF1",4));
 assert((packet[10]|(packet[11]<<8))==ATHENA_RELEASE_PID);assert(packet[12]==1&&packet[13]==16&&packet[14]==1&&packet[15]==2);
 assert(!strcmp((char *)packet+20,ATHENA_RELEASE_BUILD));assert(!writes&&!erases);
#else
 assert(command(14,0,0)==SU_COMMAND);assert(!writes&&!erases);
#endif
 assert(argc==3);FILE *f=fopen(argv[1],"rb");assert(f);unsigned size=fread(image,1,sizeof image,f);fclose(f);assert(size>SU_FEATURE_SIZE);
 assert(crc((const uint8_t *)"123456789",9)==0xcbf43926u);assert(crc(image,size)==strtoul(argv[2],NULL,10));
 memset(flash,255,sizeof flash);
 assert(command(SU_FAST_INFO,0,0)==SU_OK&&!memcmp(packet+6,"FST1",4));
 stage(0,SU_BLOCK_DATA);assert(command(SU_BENCH,0,0)==SU_OK);assert(!writes&&!erases);
 begin(size,false);
 stage(0,SU_BLOCK_DATA)[12]^=1;assert(command(SU_BLOCK,0,0)==SU_CRC);assert(!writes&&!erases);
 stage(0,SU_BLOCK_DATA);assert(command(SU_BLOCK,0,22)==SU_ORDER);assert(!writes&&!erases);
 stage(0,SU_BLOCK_DATA);assert(command(SU_BLOCK,1,0)==SU_ORDER);assert(!writes&&!erases);assert(command(SU_ABORT,0,0)==0);
 begin(size,false);send_image(size);assert(flash[0x400000]==255);assert(command(SU_COMMIT,0,0)==0);assert(!memcmp(flash+0x400000,image,size));
 assert(big_erases==((size+4095u)&~4095u)/65536);
 assert(small_erases==(((size+4095u)&~4095u)%65536)/4096);
 assert(packet[30]==1);
 for(unsigned i=0x600000;i<sizeof flash;i++)assert(flash[i]==255);
 unsigned saved_writes=writes,saved_erases=erases;
 stage(0,SU_BLOCK_DATA);assert(command(SU_BENCH,0,0)==0);assert(writes==saved_writes&&erases==saved_erases);
 // Per-block CRC is not a replacement for the final Flash CRC.
 begin(size,true);send_image(size);assert(command(SU_COMMIT,0,0)==SU_CRC);assert(flash[0x400000]==255);
 begin(size,false);fail_write=true;stage(0,SU_BLOCK_DATA);assert(command(SU_BLOCK,0,0)==SU_FLASH);assert(!su_busy());fail_write=false;
 begin(size,false);fail_erase=true;stage(0,SU_BLOCK_DATA);assert(command(SU_BLOCK,0,0)==SU_FLASH);assert(!su_busy());fail_erase=false;
 // Invalid image headers cannot erase existing data.
 saved_erases=erases;image[0]^=1;begin(size,false);stage(0,SU_BLOCK_DATA);assert(command(SU_BLOCK,0,0)==SU_FORMAT);assert(erases==saved_erases);image[0]^=1;
 begin(size,false);stage(0,SU_BLOCK_DATA);assert(command(SU_BLOCK,0,0)==0);
 // Duplicate and oversized tails are rejected before consuming more bytes.
 stage(0,SU_BLOCK_DATA);assert(command(SU_BLOCK,0,0)==SU_ORDER);
 assert(command(SU_ABORT,0,0)==0);
 assert(command(SU_BLOCK,0,0)==SU_ORDER);
 for(unsigned slot=1;slot<3;slot++){
    range_base=0x400000+slot*0x200000;memcpy(snapshot,flash,sizeof flash);
    memset(packet,0,32);packet[2]=SU_BEGIN;packet[4]=slot;put32(packet+6,size);put32(packet+10,crc(image,size));su_receive(packet);assert(!packet[5]);
    for(unsigned off=0;off<size;off+=SU_BLOCK_DATA){unsigned n=size-off>SU_BLOCK_DATA?SU_BLOCK_DATA:size-off;stage(off,n)[3]=slot;assert(command(SU_BLOCK,slot,off)==0);}
    assert(command(SU_COMMIT,slot,0)==0);assert(!memcmp(flash+range_base,image,size));
    assert(!memcmp(snapshot,flash,range_base));
    assert(!memcmp(snapshot+range_base+0x200000,flash+range_base+0x200000,sizeof flash-range_base-0x200000));
 }
 puts("PASS fast blocks: exact image, per-block/final CRC, benchmark no writes, order, partial tail, header-last and Flash errors");
}
