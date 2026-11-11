// SPDX-License-Identifier: GPL-2.0-or-later
#include "screen_keys.h"
#include "pet.h"
bool screen_mode_key(uint16_t code,bool pressed){
 if(code<0x7e10||code>0x7e12)return false;
 if(pressed){uint8_t response[32]={0};pet_command(17,code-0x7e10,response);}
 return true;
}
