import assert from "node:assert/strict";
import test from "node:test";
import { createParticleData, PARTICLE_FORMS } from "../components/immersive/particle-data";

test("all four morph targets have the same finite point count", () => {
  const count = 512;
  const { targets, seeds, tones, sizes } = createParticleData(count);
  for (const key of PARTICLE_FORMS) {
    assert.equal(targets[key].length, count * 3);
    assert.ok(targets[key].every(Number.isFinite), key);
  }
  for (const values of [seeds, tones, sizes]) {
    assert.equal(values.length, count);
    assert.ok(values.every(Number.isFinite));
  }
});

test("particle targets are seeded and distinct, not four identical clouds", () => {
  const first = createParticleData(256);
  const second = createParticleData(256);
  for (const key of PARTICLE_FORMS) assert.deepEqual(first.targets[key], second.targets[key]);
  assert.notDeepEqual(first.targets.universe, first.targets.website);
  assert.notDeepEqual(first.targets.website, first.targets.poster);
  assert.notDeepEqual(first.targets.poster, first.targets.video);
});

test("website, poster and video geometry remains in the camera-safe domain", () => {
  const { targets, seeds, tones, sizes } = createParticleData(3000);
  for (const key of ["website", "poster", "video"] as const) {
    assert.ok(targets[key].every((value) => Math.abs(value) < 6), key);
  }
  assert.ok(seeds.every((value) => value >= 0 && value <= 1));
  assert.ok(tones.every((value) => value >= 0 && value <= 1));
  assert.ok(sizes.every((value) => value > 0 && value < 3));
});
