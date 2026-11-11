import test from "node:test";
import assert from "node:assert/strict";
import { buildKeycode, decodeKeycode } from "../src/keycode-builders.js";
import { KEYCODES, parseKeycode, keyInfo } from "../src/keycodes.js";
import {
  encodeMacro,
  decodeMacro,
  splitMacros,
  packMacros,
} from "../src/macro-codec.js";
import { AdvancedDevice, words } from "../src/advanced-protocol.js";
import { encodeSetting } from "../src/qmk-settings.js";
import { RuntimeV2 } from "../src/runtime-v2.js";
test("pinned QMK catalog includes numpad, international, full mouse and aliases without unsupported engines", () => {
  assert.equal(parseKeycode("KC_P7"), 0x5f);
  assert.equal(parseKeycode("KC_KP_7"), 0x5f);
  assert.equal(parseKeycode("KC_INT1"), 0x87);
  assert.equal(parseKeycode("MO(7)"), 0x5227);
  assert.equal(parseKeycode("PDF(1)"), 0x52e1);
  assert.equal(parseKeycode("TD(3)"), 0x5703);
  assert.ok(KEYCODES.some((k) => k.code === 0xdf));
  assert.ok(KEYCODES.length > 300);
  assert.ok(!KEYCODES.some((k) => k.code >= 0x7100 && k.code < 0x7480));
  assert.match(keyInfo(0x2104).title, /轻按 A/);
  assert.throws(() => parseKeycode("MO(8)"));
});
test("all supported packed keycodes round trip; invalid layer/key/modifier combinations rejected", () => {
  for (const type of ["MODS", "MT", "LT", "LM", "OSM"])
    for (let layer = 0; layer < 8; layer++)
      for (const mods of [1, 15, 17, 31]) {
        const c = buildKeycode(type, { key: 44, layer, mods });
        assert.equal(buildKeycode(type, decodeKeycode(c)), c);
      }
  assert.throws(() => buildKeycode("LT", { layer: 8 }));
  assert.throws(() => buildKeycode("MT", { key: 0x5221 }));
  assert.throws(() => buildKeycode("MODS", { mods: 16 }));
});
test("macro codec handles extended zero-low-byte keys, base-255 delays and text without losing adjacent macros", () => {
  const actions = [
    { type: "text", value: "Hi\n" },
    { type: "down", value: 224 },
    { type: "tap", value: 4 },
    { type: "up", value: 224 },
    { type: "tap", value: 0x100 },
    { type: "tap", value: 0x5701 },
    { type: "delay", value: 65024 },
  ];
  const bytes = encodeMacro(actions);
  assert.deepEqual(decodeMacro(bytes), actions);
  assert.ok([...bytes].every(Boolean));
  const other = Uint8Array.of(128, 129),
    buf = packMacros([bytes, other, new Uint8Array()], 128);
  assert.deepEqual(splitMacros(buf, 3), [bytes, other, new Uint8Array()]);
  assert.throws(() => packMacros([bytes], 4));
  for (const bad of [
    [{ type: "text", value: "中文" }],
    [{ type: "down", value: 224 }],
    [{ type: "up", value: 4 }],
    [{ type: "delay", value: 65025 }],
  ])
    assert.throws(() => encodeMacro(bad));
  assert.throws(() => decodeMacro(Uint8Array.of(1, 5, 3)));
  assert.throws(() => splitMacros(new Uint8Array([1, 255]), 1));
});
class Hid {
  opened = true;
  listeners = new Set();
  calls = [];
  entries = {
    td: [new Uint8Array(10), new Uint8Array(10)],
    combo: [new Uint8Array(10)],
    override: [new Uint8Array(10)],
  };
  macro = new Uint8Array(90);
  settings = { 2: words([50]), 7: words([200]), 21: new Uint8Array(4) };
  ignore = false;
  failBody = false;
  addEventListener(_, f) {
    this.listeners.add(f);
  }
  removeEventListener(_, f) {
    this.listeners.delete(f);
  }
  async close() {
    this.opened = false;
  }
  async sendReport(id, p) {
    this.calls.push([...p]);
    let r = p.slice();
    if (p[0] === 254) {
      const cmd = p[1];
      if (cmd === 13) {
        if (!p[2]) {
          r.fill(0);
          r.set([2, 1, 1]);
        } else {
          r[0] = 0;
          const type = {
            1: "td",
            2: "td",
            3: "combo",
            4: "combo",
            5: "override",
            6: "override",
          }[p[2]];
          if (p[2] % 2) r.set(this.entries[type][p[3]], 1);
          else if (!this.ignore) this.entries[type][p[3]] = p.slice(4, 14);
        }
      } else if (cmd === 9) {
        r.fill(255);
        r.set(
          words(
            Object.keys(this.settings)
              .map(Number)
              .filter((n) => n > p[2] + p[3] * 256),
          ),
        );
      } else if (cmd === 10) {
        r[0] = 0;
        r.set(this.settings[p[2]], 1);
      } else if (cmd === 11) {
        r[0] = 0;
        if (!this.ignore)
          this.settings[p[2]] = p.slice(4, 4 + this.settings[p[2]].length);
      } else throw Error("unexpected");
    } else if (p[0] === 12) r[1] = 3;
    else if (p[0] === 13) {
      r[1] = 0;
      r[2] = 90;
    } else if (p[0] === 14)
      r.set(this.macro.slice(p[1] * 256 + p[2], p[1] * 256 + p[2] + p[3]), 4);
    else if (p[0] === 15) {
      if (this.failBody && p[2] !== 89) throw Error("disconnect during body");
      if (!this.ignore) this.macro.set(p.slice(4, 4 + p[3]), p[1] * 256 + p[2]);
    } else throw Error("unexpected");
    queueMicrotask(() => {
      for (const f of this.listeners) {
        const noise = new Uint8Array(32);
        noise.set([253, 168, 16]);
        f({ data: new DataView(noise.buffer) });
        f({ data: new DataView(r.buffer) });
      }
    });
  }
}
async function setup() {
  const h = new Hid(),
    a = new AdvancedDevice(new RuntimeV2(h));
  await a.capabilities();
  return { h, a };
}
test("Vial capabilities, little endian structs, per-rule backup and readback", async () => {
  const { h, a } = await setup();
  assert.deepEqual(a.caps, {
    td: 2,
    combo: 1,
    override: 1,
    macros: 3,
    macroSize: 90,
    settings: [2, 7, 21],
  });
  const before = await a.readEntry("td", 0),
    after = words([4, 224, 5, 0, 210]);
  let backed = false;
  assert.deepEqual(
    await a.applyEntry("td", 0, before, after, async (r) => {
      assert.deepEqual(r.bytes, [...before]);
      backed = true;
    }),
    after,
  );
  assert.ok(backed);
  assert.deepEqual(h.entries.td[1], new Uint8Array(10));
  await assert.rejects(() => a.readEntry("td", 2));
  await a.applySetting(7, words([200]), words([225]), async () => {});
  assert.deepEqual([...h.settings[7]], [225, 0]);
});
test("conflict, backup failure, ignored write and invalid sizes cannot report success", async () => {
  for (const mode of ["stale", "backup", "ignored"]) {
    const { h, a } = await setup(),
      before = await a.readEntry("combo", 0),
      after = words([4, 5, 0, 0, 41]);
    if (mode === "stale") h.entries.combo[0][0] = 6;
    if (mode === "ignored") h.ignore = true;
    await assert.rejects(() =>
      a.applyEntry("combo", 0, before, after, async () => {
        if (mode === "backup") throw Error("quota");
      }),
    );
    if (mode !== "ignored")
      assert.ok(
        !h.calls.some((p) => p[0] === 254 && p[1] === 13 && p[2] === 4),
      );
  }
  assert.throws(() => encodeSetting(10, 256));
  assert.throws(() => encodeSetting(9, 3000));
});
test("macro gate is verified before body, full readback before commit, other macros survive", async () => {
  const { h, a } = await setup(),
    before = await a.readMacros(),
    after = packMacros(
      [Uint8Array.of(65), Uint8Array.of(66), new Uint8Array()],
      90,
    );
  let backed = false;
  await a.applyMacros(before, after, async () => {
    backed = true;
    assert.ok(!h.calls.some((p) => p[0] === 15));
  });
  assert.ok(backed);
  assert.deepEqual(h.macro, after);
  const writes = h.calls.filter((p) => p[0] === 15);
  assert.deepEqual(writes[0].slice(1, 5), [0, 89, 1, 255]);
  assert.deepEqual(writes.at(-1).slice(1, 5), [0, 89, 1, 0]);
  for (const mode of ["gate", "body"]) {
    const { h, a } = await setup();
    if (mode === "gate") h.ignore = true;
    else h.failBody = true;
    await assert.rejects(() =>
      a.applyMacros(awaitableZero(), after, async () => {}),
    );
    if (mode === "body") assert.equal(h.macro.at(-1), 255);
    else assert.equal(h.calls.filter((p) => p[0] === 15).length, 1);
  }
  function awaitableZero() {
    return new Uint8Array(90);
  }
});

test("basic mode is restricted to common functions; advanced retains full catalog and typed groups", async () => {
  const { categoryKeys, PICKER_GROUPS } =
    await import("../src/keycode-categories.js");
  const basic = categoryKeys(KEYCODES, "basic", "全部键码"),
    advanced = categoryKeys(KEYCODES, "advanced", "全部键码");
  assert.ok(basic.length < advanced.length);
  assert.ok(basic.some((k) => k.code === 0x5221));
  assert.ok(
    !basic.some(
      (k) =>
        k.code === 0x52e1 ||
        k.code === 0x7c03 ||
        k.code === 0x68 ||
        k.code === 0xa5,
    ),
  );
  assert.equal(categoryKeys(KEYCODES, "basic", "层切换").length, 32);
  assert.equal(categoryKeys(KEYCODES, "advanced", "层切换").length, 56);
  assert.equal(
    categoryKeys(KEYCODES, "basic", "全部键码", "KC_INT1").length,
    0,
  );
  assert.ok(
    PICKER_GROUPS.advanced.flatMap((g) => g.items).some(([n]) => n === "宏"),
  );
  assert.ok(
    !PICKER_GROUPS.basic.flatMap((g) => g.items).some(([n]) => n === "宏"),
  );
});
