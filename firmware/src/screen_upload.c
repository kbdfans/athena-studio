// SPDX-License-Identifier: GPL-2.0-or-later
#include "screen_upload.h"
#include <string.h>

static const uint32_t bases[6]={0x400000,0x500000,0x600000,0x800000,0xa00000,0xc00000};
static uint32_t capacity(uint8_t slot){return slot<2?0x100000:0x200000;}
static uint32_t le32(const uint8_t *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static uint16_t le16(const uint8_t *p){return p[0]|(uint16_t)p[1]<<8;}
static void put32(uint8_t *p,uint32_t n){for(int i=0;i<4;i++)p[i]=n>>(8*i);}
static struct {
    bool active, erased;
    uint8_t slot, page[256], header[256];
    uint32_t size, received, expected_crc, crc, updated;
} upload;

uint32_t su_crc32(uint32_t crc,const uint8_t *p,size_t n){
    while(n--){crc^=*p++;for(int bit=0;bit<8;bit++)crc=(crc>>1)^((crc&1)?0xedb88320u:0);}
    return crc;
}
static bool valid_header(const uint8_t *p,uint32_t size,uint8_t slot){
    bool empty=true;for(int i=0;i<256;i++)if(p[i]!=255)empty=false;
    // Only a full-slot backup may intentionally restore an empty slot.
    if(empty)return size==capacity(slot);
    const uint8_t magic[]={0,255,18,0,0,81,71,70,1};
    uint32_t bytes=le32(p+9);uint16_t n=le16(p+21);
    return !memcmp(p,magic,9)&&le32(p+13)==~bytes&&le16(p+17)==128&&le16(p+19)==128&&
           n>0&&n<=(slot<2?31:63)&&bytes==28u+n*32788u&&bytes<=size&&
           (size==bytes||size==capacity(slot));
}
static void abort_upload(void){upload.active=false;su_display_pause(false);}
void su_task(void){if(upload.active&&(uint32_t)(su_millis()-upload.updated)>15000)abort_upload();}

static uint8_t write_page(uint32_t offset){
    if(offset==0){
        if(!valid_header(upload.page,upload.size,upload.slot))return SU_FORMAT;
        memcpy(upload.header,upload.page,256);return SU_OK;
    }
    uint32_t base=bases[upload.slot];
    if(!upload.erased){if(!su_flash_erase(base))return SU_FLASH;upload.erased=true;}
    if(offset%4096==0&&!su_flash_erase(base+offset))return SU_FLASH;
    if(!su_flash_program(base+offset,upload.page)||memcmp(su_flash_ptr(base+offset),upload.page,256))return SU_FLASH;
    return SU_OK;
}

void su_receive(uint8_t p[32]){
    const uint8_t op=p[2],slot=p[4],count=p[5];
    uint32_t offset=le32(p+6);uint8_t data[22];memcpy(data,p+10,22);
    uint32_t size=offset,crc=le32(p+10);
    memset(p+5,0,27);
    if(slot>=6){p[5]=SU_RANGE;return;}
    su_task();
    if(op==SU_INFO){
        memcpy(p+6,"ASU1",4);p[10]=1;p[11]=upload.active;p[12]=22;p[13]=24;
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
        upload.crc=0xffffffffu;upload.updated=su_millis();memset(upload.page,255,256);
        su_display_pause(true);upload.active=true;return;
    }
    if(op==SU_ABORT){if(upload.active&&slot!=upload.slot){p[5]=SU_ORDER;return;}abort_upload();return;}
    if(!upload.active||slot!=upload.slot){p[5]=SU_ORDER;return;}
    upload.updated=su_millis();
    if(op==SU_DATA){
        if(!count||count>22||offset!=upload.received||count>upload.size-upload.received){p[5]=SU_ORDER;return;}
        for(uint8_t i=0;i<count;i++){
            upload.page[upload.received%256]=data[i];upload.crc=su_crc32(upload.crc,data+i,1);upload.received++;
            if(upload.received%256==0||upload.received==upload.size){
                uint32_t page_offset=(upload.received-1)&~255u;
                uint8_t result=write_page(page_offset);
                memset(upload.page,255,256);
                if(result){p[5]=result;abort_upload();return;}
            }
        }
        put32(p+6,upload.received);return;
    }
    if(op==SU_COMMIT){
        if(upload.received!=upload.size){p[5]=SU_ORDER;return;}
        if((upload.crc^0xffffffffu)!=upload.expected_crc){p[5]=SU_CRC;abort_upload();return;}
        // Check actual Flash before publishing the header. An interrupted upload remains invalid.
        uint32_t actual=su_crc32(0xffffffffu,upload.header,256);
        actual=su_crc32(actual,su_flash_ptr(bases[slot]+256),upload.size-256)^0xffffffffu;
        if(actual!=upload.expected_crc){p[5]=SU_CRC;abort_upload();return;}
        if(!upload.erased||!su_flash_program(bases[slot],upload.header)||memcmp(su_flash_ptr(bases[slot]),upload.header,256)){
            p[5]=SU_FLASH;abort_upload();return;
        }
        put32(p+6,actual);abort_upload();return;
    }
    p[5]=SU_COMMAND;
}
