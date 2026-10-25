/**
 * A small, deterministic damped-wave field, not a Navier–Stokes fluid solver.
 * The CPU integrates a fixed 96 × 64 grid; the existing Three.js renderer samples
 * the resulting texture. No per-particle JavaScript objects or second GL context.
 */
export const FIELD_WIDTH = 96;
export const FIELD_HEIGHT = 64;
export const FIELD_WORLD_WIDTH = 20;
export const FIELD_WORLD_HEIGHT = 13;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class LiquidField {
  readonly width = FIELD_WIDTH;
  readonly height = FIELD_HEIGHT;
  readonly pixels = new Uint8Array(FIELD_WIDTH * FIELD_HEIGHT * 4);
  private heights = new Float32Array(FIELD_WIDTH * FIELD_HEIGHT);
  private nextHeights = new Float32Array(FIELD_WIDTH * FIELD_HEIGHT);
  private velocities = new Float32Array(FIELD_WIDTH * FIELD_HEIGHT);
  private active = false;

  constructor() {
    for (let i = 0; i < this.pixels.length; i += 4) {
      this.pixels[i] = 128;
      this.pixels[i + 3] = 255;
    }
  }

  /** Add a localized velocity impulse in world coordinates. */
  splash(x: number, y: number, strength = 1, radius = 0.72) {
    if (![x, y, strength, radius].every(Number.isFinite) || strength === 0) return;
    const gx = (x / FIELD_WORLD_WIDTH + 0.5) * (this.width - 1);
    const gy = (y / FIELD_WORLD_HEIGHT + 0.5) * (this.height - 1);
    const rx = Math.max(2, radius / FIELD_WORLD_WIDTH * this.width * 2.2);
    const ry = Math.max(2, radius / FIELD_WORLD_HEIGHT * this.height * 2.2);
    const force = clamp(strength, -2, 2);
    for (let yy = Math.max(1, Math.floor(gy - ry * 2)); yy <= Math.min(this.height - 2, Math.ceil(gy + ry * 2)); yy++) {
      for (let xx = Math.max(1, Math.floor(gx - rx * 2)); xx <= Math.min(this.width - 2, Math.ceil(gx + rx * 2)); xx++) {
        const distance = ((xx - gx) / rx) ** 2 + ((yy - gy) / ry) ** 2;
        if (distance < 4) this.velocities[yy * this.width + xx] -= force * Math.exp(-distance * 1.8);
      }
    }
    this.active = true;
  }

  /** Fixed-step integration keeps wave propagation stable after a slow frame. */
  step(dt = 1 / 60) {
    if (!this.active) return false;
    const delta = clamp(dt, 1 / 240, 1 / 30);
    const drag = Math.exp(-3.7 * delta);
    const settling = Math.exp(-0.28 * delta);
    const tension = 19;
    let peak = 0;
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const i = y * this.width + x;
        const h = this.heights[i];
        const laplacian = this.heights[i - 1] + this.heights[i + 1] + this.heights[i - this.width] + this.heights[i + this.width] - 4 * h;
        const velocity = (this.velocities[i] + laplacian * tension * delta) * drag;
        const next = clamp((h + velocity * delta) * settling, -1.5, 1.5);
        this.velocities[i] = velocity;
        this.nextHeights[i] = next;
        peak = Math.max(peak, Math.abs(next), Math.abs(velocity) * 0.25);
      }
    }
    [this.heights, this.nextHeights] = [this.nextHeights, this.heights];
    this.nextHeights.fill(0);
    for (let i = 0; i < this.heights.length; i++) this.pixels[i * 4] = Math.round(128 + clamp(this.heights[i], -1, 1) * 127);
    this.active = peak > 0.0008;
    return this.active;
  }

  get needsUpdate() { return this.active; }
  heightAt(x: number, y: number) { return this.heights[clamp(Math.floor(y), 0, this.height - 1) * this.width + clamp(Math.floor(x), 0, this.width - 1)]; }
  dispose() {
    this.heights.fill(0); this.nextHeights.fill(0); this.velocities.fill(0); this.active = false;
  }
}
