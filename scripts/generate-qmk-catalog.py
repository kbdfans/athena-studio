"""Rebuild from the pinned Athena QMK header; no network or device writes."""
import re,json,sys,pathlib
source=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/athena-vial-qmk-v6/quantum/keycodes.h').read_text()
source=source.split('enum qk_keycode_defines')[1]
entries=[]; names={}
for name,value in re.findall(r'^\s+(\w+)\s*=\s*(0x[0-9A-Fa-f]+|\w+),', source,re.M):
    code=int(value,16) if value.startswith('0x') else names.get(value)
    if code is None:continue
    names[name]=code
    if not value.startswith('0x'):continue
    allowed=code<0x100 or 0x7000<=code<=0x7022 or 0x7820<=code<=0x7834 or 0x7c00<=code<=0x7c04 or 0x7c10<=code<=0x7c16 or 0x7c18<=code<=0x7c1e or 0x7c50<=code<=0x7c52 or 0x7c5a<=code<=0x7c5f or code in [0x7c77,0x7c78]
    if not allowed:continue
    cat='系统'
    if code<=0x52 or 0x68<=code<=0x73:cat='基础'
    if name.startswith('KC_KP_') or code==0x53:cat='小键盘'
    if 'INTERNATIONAL' in name or 'LANGUAGE' in name or 'NONUS' in name:cat='国际键'
    if 0xa8<=code<=0xc2:cat='媒体'
    if 0xcd<=code<=0xdf:cat='鼠标'
    if 0xe0<=code<=0xe7:cat='修饰键'
    if 0x7000<=code<=0x7022:cat='系统'
    if 0x7820<=code<=0x7834:cat='灯光'
    if code>=0x7c00:cat='特殊'
    entries.append(dict(code=code,name=name,category=cat))
valid={e['code'] for e in entries}
pathlib.Path('src/qmk-catalog.js').write_text('// Generated from Athena QMK be6d662b quantum/keycodes.h (GPL-2.0-or-later).\n// Feature whitelist matches the Athena vial build; unavailable engines are excluded.\nexport const QMK_CATALOG = '+json.dumps(entries,ensure_ascii=False,indent=2)+';\nexport const QMK_NAMES = '+json.dumps({n:c for n,c in names.items() if c in valid},indent=2)+';\n')
print(len(entries),'canonical keys')
