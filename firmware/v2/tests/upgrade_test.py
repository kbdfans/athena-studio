"""Validate update write boundaries using adversarial nonblank bytes outside targets."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from migration import FLASH_SIZE
from upgrade_plan import plan_upgrade, plan_transport_upgrade

class UpgradePlanTest(unittest.TestCase):
    def setUp(self):
        self.old=b'\x51'*8192;self.new=b'\x62'*12288
        self.pet=bytes([80,84,51,50,1,32,32,2,6,4])+bytes(6390)
        self.flash=bytearray(b'\xa5'*FLASH_SIZE);self.flash[:len(self.old)]=self.old;self.flash[0xa00000:0xa0000a]=self.pet[:10]
    def test_only_main_and_asset_change(self):
        target,sectors,_=plan_upgrade(bytes(self.flash),self.old,self.new,self.pet)
        self.assertEqual(sectors,[0,4096,8192,0xa00000,0xa01000])
        self.assertEqual(target[12288:0xa00000],self.flash[12288:0xa00000])
        self.assertEqual(target[0xa01900:],self.flash[0xa01900:])
    def test_new_resource_preserves_partial_sector_tail_and_all_other_regions(self):
        pet=(Path(__file__).resolve().parents[3]/'public/pixel-cat.pt40').read_bytes()
        target,sectors,_=plan_upgrade(bytes(self.flash),self.old,self.new,pet)
        self.assertEqual(sectors,[0,4096,8192,0xa00000,0xa01000,0xa02000,0xa03000])
        self.assertEqual(target[0xa00000:0xa03800],pet)
        self.assertEqual(target[0xa03800:],self.flash[0xa03800:])
        self.assertEqual(target[0x1f0000:0xa00000],self.flash[0x1f0000:0xa00000])
    def test_unknown_main_and_layout_rejected(self):
        self.flash[8]^=1
        with self.assertRaises(AssertionError):plan_upgrade(bytes(self.flash),self.old,self.new,self.pet)
        self.flash[8]^=1;self.flash[0xa00000]=0
        with self.assertRaises(AssertionError):plan_upgrade(bytes(self.flash),self.old,self.new,self.pet)
    def test_transport_update_preserves_every_byte_outside_main_program(self):
        target,sectors,report=plan_transport_upgrade(bytes(self.flash),self.old,self.new)
        self.assertEqual(sectors,[0,4096,8192])
        self.assertEqual(target[len(self.new):],self.flash[len(self.new):])
        self.assertTrue(report['pet_asset_unchanged'])
        self.flash[0]^=1
        with self.assertRaises(AssertionError):plan_transport_upgrade(bytes(self.flash),self.old,self.new)
        with self.assertRaises(AssertionError):plan_transport_upgrade(bytes(self.flash),bytes(self.flash[:len(self.old)]),b'x'*0x1f0000)
if __name__=='__main__':unittest.main()
