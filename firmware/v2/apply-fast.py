"""Add Feature reports to the verified v2 checkout; preserve VIA's 32-byte reports."""
from pathlib import Path
import shutil
import sys
root = Path(sys.argv[1]).resolve()
here = Path(__file__).resolve().parent
board = root / 'keyboards/ydkb/athena75'
def edit(path, old, new):
    data = path.read_text()
    if new in data: return
    assert data.count(old) == 1, (path, 'unexpected source')
    path.write_text(data.replace(old, new))
config = board / 'config.h'
assert 'Athena75 Screen Studio v2 Pet' in config.read_text()
if '#define ATHENA_FAST_UPLOAD' not in config.read_text():
    config.write_text(config.read_text() + '\n#define ATHENA_FAST_UPLOAD\n')
for name in ('screen_upload.c', 'screen_upload.h', 'screen_upload_platform.c', 'screen_crc_table.h'):
    shutil.copy2(here / 'src' / name, board / name)
descriptor = root / 'tmk_core/protocol/usb_descriptor.c'
old = '''        HID_RI_OUTPUT(8, HID_IOF_DATA | HID_IOF_VARIABLE | HID_IOF_ABSOLUTE | HID_IOF_NON_VOLATILE),
    HID_RI_END_COLLECTION(0),
};
#endif

#ifdef CONSOLE_ENABLE'''
new = old.replace('    HID_RI_END_COLLECTION(0),', '''#ifdef ATHENA_FAST_UPLOAD
        HID_RI_USAGE(8, 0x64),
        HID_RI_REPORT_COUNT(16, 4096),
        HID_RI_REPORT_SIZE(8, 8),
        HID_RI_FEATURE(8, HID_IOF_DATA | HID_IOF_VARIABLE | HID_IOF_ABSOLUTE),
#endif
    HID_RI_END_COLLECTION(0),''')
edit(descriptor, old, new)
usb = root / 'tmk_core/protocol/chibios/usb_main.c'
edit(usb, 'static uint8_t _Alignas(4) set_report_buf[2];', '''#ifdef ATHENA_FAST_UPLOAD
#include "screen_upload.h"
// IRQ callback publishes a completed buffer only. Flash work stays in the main loop.
static void athena_feature_cb(USBDriver *usbp) {(void)usbp;su_feature_received();}
#endif
static uint8_t _Alignas(4) set_report_buf[2];''')
edit(usb, '''                    case HID_REQ_SetReport:
                        switch (setup->wIndex) {''', '''                    case HID_REQ_SetReport:
#ifdef ATHENA_FAST_UPLOAD
                        if (setup->wIndex == RAW_INTERFACE && setup->wValue.hbyte == 3 && setup->wValue.lbyte == 0 && setup->wLength == SU_FEATURE_SIZE) {
                            uint8_t *buffer = su_feature_buffer();
                            if (!buffer) return false;
                            usbSetupTransfer(usbp, buffer, SU_FEATURE_SIZE, athena_feature_cb);
                            return true;
                        }
#endif
                        switch (setup->wIndex) {''')
print('Installed Athena Feature transport; ordinary VIA reports unchanged')
