import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SOUND, SOUND_STORAGE_KEY, readSoundSettings, soundManager } from "../lib/sound-manager";

const storage = (value: string | null) => ({ getItem: (key: string) => key === SOUND_STORAGE_KEY ? value : null }) as Storage;

test("sound is opt-in and malformed preferences fall back safely", () => {
  assert.deepEqual(readSoundSettings(storage(null)), DEFAULT_SOUND);
  assert.deepEqual(readSoundSettings(storage("bad json")), DEFAULT_SOUND);
  assert.deepEqual(readSoundSettings(storage("{\"muted\":false,\"volume\":0.24}")), { muted: false, volume: .24 });
  assert.equal(readSoundSettings(storage("{\"volume\":3}")).volume, .35);
  assert.equal(readSoundSettings(storage("{\"volume\":-1}")).volume, 0);
});

test("sound initialization restores browser preferences without creating audio", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage('{"muted":false,"volume":0.2}') } });
  try { assert.deepEqual(soundManager.initialize(), { muted: false, volume: .2 }); }
  finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
    soundManager.initialize(storage(null));
  }
});
