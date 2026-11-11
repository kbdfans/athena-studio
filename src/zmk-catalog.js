// Native USB HID usages and ZMK behavior semantics. Never reuse QMK's internal
// media/mouse keycode numbers as HID keyboard usages.
export const ZMK_KEYS=[];
const add=(code,label,title=label)=>ZMK_KEYS.push({code,label,title});
for(let i=0;i<26;i++)add(4+i,String.fromCharCode(65+i));
for(let i=0;i<10;i++)add(30+i,String((i+1)%10));
for(const [code,label,title] of [[40,'Enter','回车'],[41,'Esc','退出'],[42,'⌫','退格'],[43,'Tab','制表'],[44,'Space','空格'],[45,'−'],[46,'='],[47,'['],[48,']'],[49,'\\'],[50,'Non-US #'],[51,';'],[52,"'"],[53,'`'],[54,','],[55,'.'],[56,'/'],[57,'Caps','大写锁定'],[70,'PrtSc','截屏'],[71,'ScrLk','滚动锁定'],[72,'Pause','暂停'],[73,'Ins','插入'],[74,'Home','行首'],[75,'PgUp','上一页'],[76,'Del','删除'],[77,'End','行尾'],[78,'PgDn','下一页'],[79,'→'],[80,'←'],[81,'↓'],[82,'↑'],[100,'ISO \\'],[101,'Menu','菜单']])add(code,label,title);
for(let i=0;i<24;i++)add(i<12?58+i:104+i-12,`F${i+1}`);
['NumLock','KP /','KP *','KP −','KP +','KP Enter','KP 1','KP 2','KP 3','KP 4','KP 5','KP 6','KP 7','KP 8','KP 9','KP 0','KP .'].forEach((label,i)=>add(83+i,label));
['Ctrl','Shift','Alt','Cmd','RCtrl','RShift','RAlt','RCmd'].forEach((label,i)=>add(224+i,label));
for(let i=0;i<9;i++)add(135+i,`International ${i+1}`);for(let i=0;i<9;i++)add(144+i,`Language ${i+1}`);
export const ZMK_MEDIA=[['播放 / 暂停',0xcd],['停止播放',0xb7],['音量 +',0xe9],['音量 −',0xea],['静音',0xe2],['上一首',0xb6],['下一首',0xb5],['屏幕亮度 +',0x6f],['屏幕亮度 −',0x70]];
const rows=[
 ['kp',['key press','keypress','kp'],'普通按键 / 组合快捷键','输入与组合','按下时发送按键，松开时释放；也可以同时附带 Ctrl、Shift、Option / Alt、Cmd / Win。','选择 C，再勾选 Ctrl，按一下此键即可发送 Ctrl+C。Mac 的复制通常使用 Cmd+C。',['发送的按键'],'组合键由当前系统或应用解释。'],
 ['mo',['momentary layer','layer momentary','mo'],'按住切换层','层与双功能','按住此键启用目标层，松开后关闭该层。','把目标层的 I / J / K / L 配成方向键；按住此键即可使用方向键。',['目标层']],
 ['tog',['toggle layer','layer toggle','tog'],'开关切换层','层与双功能','按一下启用目标层，再按一下关闭；无需一直按住。','按一次进入数字层，再按一次回到原来的输入方式。',['目标层']],
 ['to',['to layer','layer to','to'],'跳转到层','层与双功能','启用目标层，并关闭默认层以外的其他层。','从游戏层直接切到工作层；建议在目标层安排一个返回基础层的键。',['目标层']],
 ['lt',['layer tap','layer-tap','lt'],'轻按按键 / 长按切层','层与双功能','轻按发送普通按键，长按时启用目标层。','轻按发送 Space；按住时启用 Fn 层，松开后回到原层。',['长按启用的层','轻按发送的按键'],'轻按与长按的判定时间、优先策略由当前固件定义，此处只设置绑定参数。'],
 ['mt',['mod tap','mod-tap','mt'],'轻按 / 长按双功能','层与双功能','轻按发送第二个按键，长按发送第一个按键；长按通常设置为修饰键。','轻按发送 A；按住时作为左 Ctrl，再按 C 发送 Ctrl+C。',['长按发送的按键','轻按发送的按键'],'轻按与长按的判定时间、优先策略由当前固件定义，此处只设置绑定参数。'],
 ['sk',['sticky key','sk'],'粘滞按键','输入与组合','按一下暂时保留该按键，供后续按键组合使用，不必持续按住。','设为 Shift：按一下，再按 A，就能输入大写 A。',['暂时保留的按键'],'释放时机和超时时间由固件决定。'],
 ['sl',['sticky layer','layer sticky','sl'],'单次使用层','层与双功能','按一下暂时启用目标层，供后续按键使用。','按一下后，在符号层选择一个符号，随后继续普通输入。',['目标层'],'释放时机和超时时间由固件决定。'],
 ['kt',['key toggle','kt'],'按键保持开关','输入与组合','按一下保持按键按下，再按一下释放。','设为 Shift：第一次按下后连续输入大写，再按一次取消。',['保持的按键']],
 ['caps',['caps word','caps_word'],'单词大写','输入与组合','连续字母自动转为大写，遇到固件规定的结束键后退出。','启用后输入 hello，得到 HELLO；输入空格后恢复普通输入。',[]],
 ['repeat',['key repeat','key_repeat'],'重复上一个键','输入与组合','再次发送最近的可重复按键。','先输入 A，再按此键重复 A；适合放在拇指键。',[]],
 ['transparent',['transparent','trans'],'透明 / 沿用下层','输入与组合','此位置不覆盖下层，继续查找更低层的按键功能。','在 Fn 层把字母区设为透明，仍可使用基础层的字母。',[]],
 ['none',['none','no operation','key(none)'],'禁用此键','输入与组合','此位置不发送按键，也不会继续使用下层功能。','将容易误触的位置设为禁用，按下时不会产生输入。',[]],
 ['bt',['bluetooth','bt'],'蓝牙连接管理','无线与设备','选择蓝牙配置位、切换设备或清除配对，选项由固件提供。','选择配置位 0 用于电脑、配置位 1 用于平板；在两个位置之间切换。',['蓝牙操作','配置位'],'清除配对会解除相应设备的绑定，之后需要重新配对。'],
 ['out',['output selection','output','out'],'USB / 蓝牙输出','无线与设备','设置键盘将按键发送到 USB 还是蓝牙，或切换输出方式。','同时插着 USB 并连接蓝牙时，可指定让按键发送到电脑或平板。',['输出方式']],
 ['rgb',['rgb underglow','rgb_ug'],'RGB 灯光','灯光与电源','使用固件提供的开关、亮度、颜色或效果命令。','给常用按键分配灯光开关，按一下切换 RGB 状态。',['灯光操作','数值'],'只有 PCB 安装并启用了相应灯光时才有效。'],
 ['backlight',['backlight','bl'],'背光控制','灯光与电源','调节固件支持的键盘背光。','选择增加亮度，按此键让背光更亮。',['背光操作','数值']],
 ['power',['external power','ext power','ext_power'],'外设供电','灯光与电源','切换固件控制的外设电源，例如显示屏或灯光供电。','将外设供电设为关闭，可在不用外设时减少耗电。',['电源操作']],
 ['off',['soft off','soft_off'],'软关机','灯光与电源','触发固件的软关机行为。','离开前按此键关闭键盘；使用 PCB 支持的唤醒方式恢复。',[],'唤醒方式取决于 PCB 和固件，可能需要复位或重新接电。'],
 ['reset',['reset','sys reset','system reset'],'重启键盘','维护与固件','按下绑定后的实体键会重启键盘。','设备连接异常时，可用此键重新启动固件。',[]],
 ['boot',['bootloader','bootload'],'进入刷机模式','维护与固件','按下绑定后的实体键会进入该 PCB 的引导程序。','需要升级 ZMK 固件时，按此键进入刷机模式。',[],'网页这里只分配快捷键，不会立即刷写固件；请使用该 PCB 对应的升级文件。'],
 ['unlock',['studio unlock','zmk studio unlock'],'解锁 Studio','维护与固件','允许 Studio 修改键位，适用于开启配置锁的固件。','连接配置器提示已锁定时，先在键盘上按此键。',[]],
 ['tapdance',['tap dance','tap-dance'],'连续轻按动作','固件自定义','根据连续轻按次数执行固件定义的不同动作。','固件可定义单击为 Esc、双击为 Caps；实际动作取决于该行为的定义。',[],'当前接口可分配此行为，不能在线编辑单击、双击动作或判定时间。'],
 ['morph',['mod morph','mod-morph'],'修饰键条件动作','固件自定义','根据是否按着指定修饰键，执行不同的预设行为。','固件可定义普通按下发送一种按键、配合 Shift 发送另一种按键。',[],'条件修饰键和两种内部动作由固件定义，不能在此页面重写。'],
 ['macro',['macro'],'预设宏','固件自定义','执行固件中定义的一串按下、松开和延迟动作。','可把固件预设的常用快捷操作分配到一个按键。',[],'宏步骤由固件源码定义；当前 Studio 接口不提供宏内容编辑。'],
 ['mouse',['mouse button','mouse buttons','mouse move','mouse scroll'],'鼠标控制','鼠标与滚轮','使用固件提供的鼠标按键、移动或滚轮功能。','给拇指键分配鼠标左键，按下即可点击。',['鼠标操作','数值']],
];
const normalize=s=>s.toLowerCase().replace(/[ _-]/g,'');
export function behaviorHelp(behavior){
 const raw=behavior.displayName||'',name=normalize(raw);let match;
 if(name==='deviceusb')return {kind:'device-usb',title:'切换 USB 模式',group:'无线与设备',description:'将键盘输入切换到 USB 连接的电脑。',example:'插好 USB 数据线后，按此键让输入通过 USB 发送到电脑。',params:[],note:'此功能是固件预设的设备切换动作；这里仅分配到按键。'};
 if((match=name.match(/^devicebt(\d+)$/)))return {kind:'device-bt',title:`蓝牙设备 ${Number(match[1])}`,group:'无线与设备',description:'切换到对应编号的蓝牙设备。',example:'把设备 1 用于电脑、设备 2 用于平板，分别按对应快捷键切换。',params:[],note:'设备编号沿用固件名称；首次使用需在系统中完成蓝牙配对。'};
 // Vendor names retain the compiled behavior ID and parameters. TP/HP only
 // identify the vendor variants; do not infer their timing from the name.
 const variant=name.match(/^(layertap|modtap)\((tp|hp)\)$/);
 const canonical=variant?variant[1]:name;
 const mouseAlias=/^mouse(move|scroll)(up|down|left|right)$/.test(name)||name==='mousekeypress';
 const row=rows.find(r=>r[1].some(n=>normalize(n)===canonical)||(mouseAlias&&r[0]==='mouse'));
 if(row){const [kind,,title,group,description,example,params,note='']=row;return {kind,title:variant?title+' · '+variant[2].toUpperCase():title,group,description,example,params,note};}
 if((behavior.metadata||[]).some(m=>[...(m.param1||[]),...(m.param2||[])].some(d=>d.layerId!==undefined)))return {kind:'custom-layer',title:raw,group:'层与双功能',description:'当前固件提供的层功能，可选择目标层后分配到按键。',example:'选择 Fn 层并应用；具体触发方式以此固件的行为定义为准。',params:[],note:'自定义层功能的触发规则由固件定义。'};
 return {kind:'custom',title:behavior.displayName||'自定义功能',group:'固件自定义',description:'这是当前固件提供的自定义行为。可设置的参数以设备返回的说明为准。',example:'先查阅该 PCB 的行为说明，再把此功能分配给选中的按键。',params:[],note:'行为内部动作、宏内容、组合触发条件和时间参数需要在 ZMK 固件源码中定义；当前 Studio 接口只能修改这里列出的绑定参数。'};
}
export const BASIC_BEHAVIOR_GROUPS=['常用层切换','蓝牙与输出','鼠标与滚轮','布局设置'];
export const ADVANCED_BEHAVIOR_GROUPS=['输入与组合','层与双功能','无线与设备','灯光与电源','鼠标与滚轮','维护与固件','固件自定义','布局设置'];
export function behaviorInCategory(behavior,category){const h=behaviorHelp(behavior);if(category==='常用层切换')return ['mo','tog','to','sl','lt','custom-layer'].includes(h.kind);if(category==='蓝牙与输出')return ['bt','out','device-usb','device-bt'].includes(h.kind);return category===h.group;}

// Native HID usages arranged as a physical 17-key numeric keypad.
export const ZMK_NUMPAD=[
 [83,0,0],[84,1,0],[85,2,0],[86,3,0],
 [95,0,1],[96,1,1],[97,2,1],[87,3,1,1,2],
 [92,0,2],[93,1,2],[94,2,2],
 [89,0,3],[90,1,3],[91,2,3],[88,3,3,1,2],
 [98,0,4,2],[99,2,4],
];
