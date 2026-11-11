import unittest,struct
from migration import plan,FLASH_SIZE,LEGACY
from qgf_rgb565 import encode
class MigrationTests(unittest.TestCase):
 def setUp(self):
  self.old=bytearray(b'\x55'*FLASH_SIZE)
  self.old[64:66]=b'\x12\x01';self.old[72:76]=bytes.fromhex('5b9d0041')
  self.new=bytes(self.old[:8192]);self.new=self.new[:100]+b'NEW'+self.new[103:]
  for slot,off in enumerate(LEGACY):
   data=encode([(bytes([slot+1])*32768,100)]);self.old[off:off+len(data)]=data
 def test_preserves_configuration_and_maps_images(self):
  target,sectors,report=plan(self.old,self.old,self.new)
  self.assertEqual(target[0x1f0000:0x400000],self.old[0x1f0000:0x400000]);self.assertEqual(target[0xe00000:],self.old[0xe00000:])
  for off,src in zip((0x400000,0x600000,0x800000),(1,2,3)):
   self.assertEqual(target[off:off+32816],self.old[LEGACY[src]:LEGACY[src]+32816])
  self.assertEqual(target[0xa00000:0xe00000],b'\xff'*0x400000)
 def test_rejects_75_and_mismatched_original(self):
  bad=bytearray(self.new);bad[74:76]=bytes.fromhex('1325')
  with self.assertRaises(AssertionError):plan(self.old,self.old,bad)
  old=self.old[:];old[90]^=1
  with self.assertRaises(AssertionError):plan(self.old,old,self.new)
 def test_rejects_unconvertible_images(self):
  old=self.old[:];off=LEGACY[1];struct.pack_into('<II',old,off+9,3000,3000^0xffffffff)
  with self.assertRaises(AssertionError):plan(old,old,self.new)
if __name__=='__main__':unittest.main()
