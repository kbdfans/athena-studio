// SPDX-License-Identifier: GPL-2.0-or-later
#include "screen_upload.h"
#include <string.h>
#include "pet.h"
#include "screen_crc_table.h"
#include "studio_release.h"

static const uint32_t bases[4]={0x400000,0x600000,0x800000,0xa00000};
static uint32_t capacity(uint8_t slot){return slot==3?0x3fe000:0x200000;}
static uint32_t le32(const uint8_t *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static uint16_t le16(const uint8_t *p){return p[0]|(uint16_t)p[1]<<8;}
static void put32(uint8_t *p,uint32_t n){for(int i=0;i<4;i++)p[i]=n>>(8*i);}
static struct {
    bool active, erased;
    uint8_t slot, page[256], header[256];
    uint8_t batch[4096] __attribute__((aligned(4)));
    uint32_t batch_offset,batch_size;
    uint32_t size, received, expected_crc, crc, updated, erased_until;
    uint32_t erase_us, program_us, verify_us, erases, programs;
} upload;
static uint8_t feature[SU_FEATURE_SIZE] __attribute__((aligned(4)));
static volatile bool feature_ready;
uint8_t *su_feature_buffer(void){return feature_ready?NULL:feature;}
void su_feature_received(void){__sync_synchronize();feature_ready=true;}

uint32_t su_crc32(uint32_t crc,const uint8_t *p,size_t n){
    while(n--)crc=(crc>>8)^su_crc_table[(crc^*p++)&255];
    return crc;
}
static bool valid_header(const uint8_t *p,uint32_t size,uint8_t slot){
    if(slot==3)return pet_pack_header_valid(p)&&size==le32(p+12);
    bool empty=true;for(int i=0;i<256;i++)if(p[i]!=255)empty=false;
    // Only a full-slot backup may intentionally restore an empty slot.
    if(empty)return size==capacity(slot);
    const uint8_t magic[]={0,255,18,0,0,81,71,70,1};
    uint32_t bytes=le32(p+9);uint16_t n=le16(p+21);
    return !memcmp(p,magic,9)&&le32(p+13)==~bytes&&le16(p+17)==128&&le16(p+19)==128&&
           n>0&&n<=63&&bytes==28u+n*32788u&&bytes<=size&&
           (size==bytes||size==capacity(slot));
}
static void abort_upload(void){upload.active=false;feature_ready=false;su_display_pause(false);}
void su_task(void){if(upload.active&&(uint32_t)(su_millis()-upload.updated)>15000)abort_upload();}

static uint8_t flush_pages(void){
    if(!upload.batch_size)return SU_OK;
    uint32_t base=bases[upload.slot];
    while(upload.batch_offset+upload.batch_size>upload.erased_until){
        uint32_t start=upload.erased_until,limit=(upload.size+4095u)&~4095u;
        // Only fully covered, aligned image blocks use the ROM's 64 KiB erase.
        // Short tails and pet assets retain 4 KiB erases; never cross a slot.
        uint32_t length=upload.slot<3&&start%65536==0&&limit-start>=65536?65536:4096;
        if(start>capacity(upload.slot)-length)return SU_RANGE;
        uint32_t t=su_micros();bool ok=su_flash_erase_range(base+start,length);
        upload.erase_us+=su_micros()-t;upload.erases++;
        if(!ok)return SU_FLASH;
        upload.erased_until=start+length;upload.erased=true;
    }
    uint32_t t=su_micros();bool ok=su_flash_program_range(base+upload.batch_offset,upload.batch,upload.batch_size);
    upload.program_us+=su_micros()-t;upload.programs++;
    if(!ok||memcmp(su_flash_ptr(base+upload.batch_offset),upload.batch,upload.batch_size))return SU_FLASH;
    upload.batch_size=0;
    return SU_OK;
}
static uint8_t write_page(uint32_t offset){
    if(offset==0){
        if(!valid_header(upload.page,upload.size,upload.slot))return SU_FORMAT;
        memcpy(upload.header,upload.page,256);return SU_OK;
    }
    if(!upload.batch_size)upload.batch_offset=offset;
    if(offset!=upload.batch_offset+upload.batch_size)return SU_ORDER;
    memcpy(upload.batch+upload.batch_size,upload.page,256);upload.batch_size+=256;
    return upload.batch_size==sizeof upload.batch?flush_pages():SU_OK;
}

static uint8_t append_data(const uint8_t *data,uint32_t count){
    upload.crc=su_crc32(upload.crc,data,count);
    while(count){
        uint32_t n=256-upload.received%256;if(n>count)n=count;
        memcpy(upload.page+upload.received%256,data,n);data+=n;count-=n;upload.received+=n;
        if(upload.received%256==0||upload.received==upload.size){
            uint32_t page_offset=(upload.received-1)&~255u;
            uint8_t result=write_page(page_offset);
            memset(upload.page,255,256);
            if(result){abort_upload();return result;}
        }
    }
    uint8_t result=flush_pages();if(result)abort_upload();return result;
}
#ifdef ATHENA_FAST_UPLOAD
static uint8_t check_feature(uint8_t slot,uint32_t offset){
    if(!feature_ready)return SU_ORDER;
    __sync_synchronize();
    uint16_t count=le16(feature+8);
    if(feature[0]!=0xfd||feature[1]!=0xa8||feature[2]!=1||feature[3]!=slot||le32(feature+4)!=offset||feature[10]||feature[11])return SU_ORDER;
    if(!count||count>SU_BLOCK_DATA)return SU_RANGE;
    if((su_crc32(0xffffffffu,feature+16,count)^0xffffffffu)!=le32(feature+12))return SU_CRC;
    return SU_OK;
}
#endif
void su_receive(uint8_t p[32]){
    const uint8_t op=p[2],slot=p[4],count=p[5];
    uint32_t offset=le32(p+6);uint8_t data[22];memcpy(data,p+10,22);
    uint32_t size=offset,crc=le32(p+10);
    memset(p+5,0,27);
    if(slot>=4){p[5]=SU_RANGE;return;}
    su_task();
    if(op==14){
#if defined(ATHENA_RELEASE_PID)
        memcpy(p+6,"ASF1",4);p[10]=ATHENA_RELEASE_PID&255;p[11]=ATHENA_RELEASE_PID>>8;
        p[12]=1;p[13]=16;p[14]=1;p[15]=2;put32(p+16,ATHENA_RELEASE_SEQUENCE);
        memcpy(p+20,ATHENA_RELEASE_BUILD,sizeof(ATHENA_RELEASE_BUILD)-1);
#else
        p[5]=SU_COMMAND;
#endif
        return;
    }
#ifdef ATHENA_FAST_UPLOAD
    if(op==SU_FAST_INFO){memcpy(p+6,"FST1",4);p[10]=SU_FEATURE_SIZE&255;p[11]=SU_FEATURE_SIZE>>8;p[12]=SU_BLOCK_DATA&255;p[13]=SU_BLOCK_DATA>>8;p[14]=1;return;}
    if(op==SU_BENCH){
        if(upload.active){p[5]=SU_BUSY;return;}
        p[5]=check_feature(slot,offset);
        if(!p[5]){put32(p+6,le32(feature+12));put32(p+10,le16(feature+8));}
        feature_ready=false;return;
    }
#endif
    if(op==22||op==23){if(upload.active){p[5]=SU_BUSY;return;}uint8_t config[16];put32(config,offset);memcpy(config+4,data,12);pet_typing_config(op,config,p);return;}
    if(op>=16){if(upload.active){p[5]=SU_BUSY;return;}pet_command(op,offset,p);return;}
    if(op==SU_INFO){
        memcpy(p+6,"ASU2",4);p[10]=2;p[11]=upload.active;p[12]=22;p[13]=24;
        put32(p+14,capacity(slot));put32(p+18,bases[slot]);put32(p+22,upload.active?upload.received:0);
        return;
    }
    if(op==SU_READ){
        if(upload.active){p[5]=SU_BUSY;return;}
        if(!count||count>24||offset>capacity(slot)-count){p[5]=SU_RANGE;return;}
        memcpy(p+6,su_flash_ptr(bases[slot]+offset),count);return;
    }
    if(op==SU_RECOVER){if(upload.active){p[5]=SU_BUSY;return;}su_display_recover();return;}
    if(op==SU_BEGIN){
        if(upload.active){p[5]=SU_BUSY;return;}
        if(size<256||size>capacity(slot)){p[5]=SU_RANGE;return;}
        memset(&upload,0,sizeof(upload));upload.slot=slot;upload.size=size;upload.expected_crc=crc;
        feature_ready=false;
        upload.crc=0xffffffffu;upload.updated=su_millis();memset(upload.page,255,256);
        su_display_pause(true);upload.active=true;return;
    }
    if(op==SU_ABORT){if(upload.active&&slot!=upload.slot){p[5]=SU_ORDER;return;}abort_upload();return;}
    if(!upload.active||slot!=upload.slot){p[5]=SU_ORDER;return;}
    upload.updated=su_millis();
#ifdef ATHENA_FAST_UPLOAD
    if(op==SU_BLOCK){
        uint8_t result=check_feature(slot,offset);uint16_t n=le16(feature+8);
        if(!result&&(offset!=upload.received||n>upload.size-upload.received))result=SU_ORDER;
        if(!result)result=append_data(feature+16,n);
        feature_ready=false;p[5]=result;put32(p+6,upload.received);return;
    }
#endif
    if(op==SU_DATA){
        if(!count||count>22||offset!=upload.received||count>upload.size-upload.received){p[5]=SU_ORDER;return;}
        p[5]=append_data(data,count);
        put32(p+6,upload.received);return;
    }
    if(op==SU_COMMIT){
        if(upload.received!=upload.size){p[5]=SU_ORDER;return;}
        if((upload.crc^0xffffffffu)!=upload.expected_crc){p[5]=SU_CRC;abort_upload();return;}
        // Check actual Flash before publishing the header. An interrupted upload remains invalid.
        uint32_t t=su_micros();
        uint32_t actual=su_crc32(0xffffffffu,upload.header,256);
        actual=su_crc32(actual,su_flash_ptr(bases[slot]+256),upload.size-256)^0xffffffffu;
        upload.verify_us=su_micros()-t;
        if(actual!=upload.expected_crc){p[5]=SU_CRC;abort_upload();return;}
        t=su_micros();bool ok=upload.erased&&su_flash_program(bases[slot],upload.header);
        upload.program_us+=su_micros()-t;upload.programs++;
        if(!ok||memcmp(su_flash_ptr(bases[slot]),upload.header,256)){
            p[5]=SU_FLASH;abort_upload();return;
        }
        put32(p+6,actual);put32(p+10,upload.erase_us/1000);put32(p+14,upload.program_us/1000);
        put32(p+18,upload.verify_us/1000);put32(p+22,upload.erases);put32(p+26,upload.programs);p[30]=1;
        abort_upload();return;
    }
    p[5]=SU_COMMAND;
}

bool su_busy(void){return upload.active;}
