#include "display_lifecycle.h"
#include <assert.h>
#include <stdio.h>
static unsigned inits,offs,inject;static uint32_t now,off_at;static bool fail;
bool dl_hw_init(void){assert(offs>0&&(uint32_t)(now-off_at)>=1000);inits++;now+=900;if(inject==1)dl_set_suspended(true);if(inject==2)dl_set_off(true);if(inject==3)dl_request_reinit();inject=0;return !fail;}
void dl_hw_off(void){offs++;off_at=now;}
uint32_t dl_now(void){return now;}
static bool settle(void){unsigned n=inits;uint32_t start=now;assert(!dl_task());assert(inits==n);now+=999;assert(!dl_task());assert(inits==n);now++;bool result=dl_task();assert((uint32_t)(now-start)==1900);return result;}
int main(int argc,char **argv){
 (void)argv;
 if(argc>1){dl_set_off(true);assert(!dl_task());assert(offs==1&&inits==0);assert(!dl_task());assert(offs==1);dl_set_off(false);assert(settle());assert(inits==1);puts("PASS saved-off boot and nonblocking turn-on delay");return 0;}
 // Startup interrupt: restart the settle interval after a host suspend.
 assert(!dl_task());now+=300;dl_set_suspended(true);assert(!dl_task());dl_set_suspended(false);assert(settle());assert(inits==1);
 for(int i=0;i<100;i++)assert(dl_task());assert(inits==1);
 unsigned off=offs;
 for(int i=0;i<100;i++){dl_set_suspended(true);assert(!dl_task());}assert(offs==off+1);
 dl_set_suspended(false);assert(settle());assert(inits==2);
 dl_set_off(true);assert(!dl_task());dl_set_suspended(true);assert(!dl_task());dl_set_suspended(false);assert(!dl_task());assert(inits==2);
 dl_set_off(false);assert(settle());assert(inits==3);
 // Off/suspend during the long reset takes precedence over display readiness.
 dl_request_reinit();inject=1;assert(!settle());assert(!(dl_flags()&4));dl_set_suspended(false);assert(settle());assert(inits==5);
 dl_request_reinit();inject=2;assert(!settle());assert(!(dl_flags()&4));dl_set_off(false);assert(settle());assert(inits==7);
 dl_request_reinit();inject=3;assert(settle());assert(dl_flags()&8);assert(settle());assert(inits==9);
 // Failed resets retry at 1s intervals and stop after three attempts.
 dl_request_reinit();fail=true;now=0xfffff000;assert(!settle());unsigned n=inits;
 now+=999;assert(!dl_task());assert(inits==n);now++;assert(!dl_task());assert(inits==n+1);
 now+=1000;assert(!dl_task());assert(inits==n+2);
 for(unsigned i=0;i<100;i++){now+=1000;assert(!dl_task());}assert(inits==n+2);
 fail=false;dl_request_reinit();assert(settle());assert(!(dl_flags()&16));
 for(int i=0;i<200;i++){dl_set_suspended(true);assert(!dl_task());dl_set_suspended(false);assert(settle());}
 puts("PASS display lifecycle: stable startup, repeated suspend, full wake init, user-off, mid-init races, bounded retries and timer wrap");
}
