import test from 'node:test';
import assert from 'node:assert/strict';
import { detectKeyPlatform, platformKeyLabel } from '../src/platform-keys.js';
import { keyInfo, parseKeycode } from '../src/keycodes.js';

test('detects macOS and Windows with platform hints and safe fallback', () => {
  assert.equal(detectKeyPlatform({ platform: 'MacIntel' }), 'mac');
  assert.equal(detectKeyPlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' }), 'windows');
  assert.equal(detectKeyPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'windows');
  assert.equal(detectKeyPlatform({ platform: 'Linux x86_64' }), 'other');
  assert.equal(detectKeyPlatform(null), 'other');
});

test('platform modifier labels round trip to identical keycodes without mutating the catalog', () => {
  for (const [platform, labels] of [
    ['mac', ['Option', 'Cmd', 'ROption', 'RCmd']],
    ['windows', ['Alt', 'Win', 'RAlt', 'RWin']],
    ['other', ['Alt', 'Super', 'RAlt', 'RSuper']],
  ]) {
    [226, 227, 230, 231].forEach((code, index) => {
      const before = { ...keyInfo(code) };
      const label = platformKeyLabel(keyInfo(code), platform);
      assert.equal(label, labels[index]);
      assert.equal(parseKeycode(label), code);
      assert.deepEqual(keyInfo(code), before);
    });
    assert.equal(platformKeyLabel(keyInfo(4), platform), 'A');
  }
});
