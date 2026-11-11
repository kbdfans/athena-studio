// Small code-drawn scene and 5x7 bitmap font, mirrored in pet_scene.h.
export const SCENE={sky:0xef7b,cloud:0xffde,grass:0xa631,grassLight:0xbe94,grassDark:0x6c6d,text:0x32e9,track:0xd6d5,xp:0x4ca9,hp:0xe44e,hungry:0xd267};
export const FONT={
 '0':[14,17,19,21,25,17,14],'1':[4,12,4,4,4,4,14],'2':[14,17,1,2,4,8,31],'3':[30,1,1,14,1,1,30],'4':[2,6,10,18,31,2,2],
 '5':[31,16,16,30,1,1,30],'6':[14,16,16,30,17,17,14],'7':[31,1,2,4,8,8,8],'8':[14,17,17,14,17,17,14],'9':[14,17,17,15,1,1,14],
 L:[16,16,16,16,16,16,31],V:[17,17,17,17,17,10,4],H:[17,17,17,31,17,17,17],P:[30,17,17,30,16,16,16],z:[0,0,31,2,4,8,31],
};
export function textPixel(text,x,y){if(x<0||y<0||y>=7)return false;const n=Math.floor(x/6),col=x%6;return col<5&&n<text.length&&!!((FONT[text[n]]?.[y]||0)&(1<<(4-col)));}
const grassPoints=[[7,103],[21,106],[109,105],[121,102],[14,119],[44,124],[84,119],[113,125]];
export function scenePixel(x,y){
 let c=y>=106?SCENE.grass:y>=102?SCENE.grassLight:SCENE.sky;
 // Two small stepped clouds, kept outside the cat silhouette.
 if((x>=7&&x<26&&y>=39&&y<42)||(x>=12&&x<22&&y>=36&&y<39)||(x>=104&&x<123&&y>=49&&y<52)||(x>=109&&x<119&&y>=46&&y<49))c=SCENE.cloud;
 for(const [gx,gy] of grassPoints){const dx=x-gx,dy=y-gy;if((dx===0&&dy>=-4&&dy<=0)||(dx===-2&&dy>=-2&&dy<=-1)||(dx===2&&dy>=-3&&dy<=-1)||(Math.abs(dx)===1&&dy===0))c=SCENE.grassDark;}
 return c;
}
export function overlayPixel(x,y,level,xp,hp,action,elapsed){
 if(textPixel('LV'+level,x-4,y-5))return SCENE.text;
 if(textPixel('HP',x-4,y-17))return hp<=25?SCENE.hungry:SCENE.text;
 const experience=level>=20?200:xp%200;
 if(x>=31&&x<124&&y>=6&&y<11)return x<31+Math.floor(experience*93/200)?SCENE.xp:SCENE.track;
 if(x>=31&&x<124&&y>=18&&y<23)return x<31+Math.floor(hp*93/100)?(hp<=25?SCENE.hungry:SCENE.hp):SCENE.track;
 if(action===3){const phase=Math.floor(elapsed/750)%4,rise=Math.floor(elapsed%750/250);for(let i=0;i<=phase;i++)if(textPixel('z',x-(81+i*12),y-(61-i*8-rise)))return SCENE.text;}
 return null;
}
