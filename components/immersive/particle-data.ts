// Deterministic targets for ONE particle system. No per-particle objects at runtime.
export type ParticleForm = "universe" | "website" | "poster" | "video";
export const PARTICLE_FORMS: ParticleForm[] = ["universe", "website", "poster", "video"];
const TAU = Math.PI * 2;
type Point = [number, number, number];
type Stroke = { from: Point; to: Point; weight: number; thickness?: number };

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function line(x: number, y: number, xx: number, yy: number, weight = 1, z = 0, thickness = .025): Stroke {
  return { from: [x, y, z], to: [xx, yy, z], weight, thickness };
}
function box(x: number, y: number, w: number, h: number, weight = 1, z = 0): Stroke[] {
  return [line(x,y,x+w,y,weight,z), line(x+w,y,x+w,y-h,weight,z), line(x+w,y-h,x,y-h,weight,z), line(x,y-h,x,y,weight,z)];
}
const website: Stroke[] = [
  ...box(-5, 3.1, 10, 6.2, 2.5), line(-5, 2.4, 5, 2.4, 2),
  line(-4.4, 2.75, -3.7, 2.75, .4, .03, .05), line(3.2, 2.75, 4.4, 2.75, .5),
  line(-4.3, 1.6, -.9, 1.6, 2, .2, .17), line(-4.3, 1.05, -1.5, 1.05, 1.7, .2, .17),
  line(-4.3, .15, -1.1, .15, .7, .15), line(-4.3, -.12, -1.6, -.12, .6, .15),
  ...box(-4.3,-.7,1.8,.55,.5,.3), ...box(.2,1.7,4,3,1.4,.3),
  line(.4,-1.1,1.7,.8,1,.3), line(1.7,.8,2.9,-.7,1,.3), line(2.9,-.7,3.5,0,.5,.3), line(3.5,0,4,-1.1,.5,.3),
  ...box(-4.3,-1.9,2.5,.65,.6,.1), ...box(-1.3,-1.9,2.5,.65,.6,.1), ...box(1.7,-1.9,2.5,.65,.6,.1),
];
const poster: Stroke[] = [
  ...box(-2.8, 4.15, 5.6, 8.3, 2),
  line(-2.2,3.55,-.8,3.55,.5),
  line(-2.2,2.7,1.7,2.7,2,.15,.24), line(-2.2,1.95,.6,1.95,1.5,.15,.24),
  line(-2.2,-2.85,1.8,-2.85,.7),line(-2.2,-3.2,.7,-3.2,.5),
  line(-2.2,-3.65,-.8,-3.65,.4),line(1.2,-3.65,2.2,-3.65,.3),
];
const video: Stroke[] = [
  ...box(-5, 2.8, 10, 5.6, 2.5),
  line(-.7,1.2,1.1,.15,1.8,.35,.05),line(1.1,.15,-.7,-.9,1.8,.35,.05),line(-.7,-.9,-.7,1.2,1.8,.35,.05),
  line(-4.3,-1.9,4.3,-1.9,1.3,.15), line(-4.3,-1.9,-.8,-1.9,.8,.2,.07),
  ...box(-4.3,-3.25,2.5,.65,.6), ...box(-1.25,-3.25,2.5,.65,.6), ...box(1.8,-3.25,2.5,.65,.6),
];

function sampleStroke(strokes: Stroke[], rand: () => number): Point {
  let pick = rand() * strokes.reduce((total, stroke) => total + stroke.weight, 0);
  let chosen = strokes[strokes.length - 1];
  for (const stroke of strokes) { pick -= stroke.weight; if (pick <= 0) { chosen = stroke; break; } }
  const t = rand(), fuzz = chosen.thickness ?? .025;
  return chosen.from.map((value, axis) => value + (chosen.to[axis] - value) * t + (rand() - .5) * fuzz) as Point;
}

export function createParticleData(count: number) {
  const rand = seeded(1024);
  const targets = Object.fromEntries(PARTICLE_FORMS.map((key) => [key, new Float32Array(count * 3)])) as Record<ParticleForm, Float32Array>;
  const seeds = new Float32Array(count);
  const tones = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const t = rand() * TAU;
    const strand = i % 3;
    const spread = Math.pow(rand(), 2.4);
    const radius = 4.5 + Math.sin(t * 3 + strand) * .75 + (spread - .45) * 1.8;
    // Three folded ribbons with a clear center, not a random starfield.
    const x = Math.cos(t) * radius * 1.55;
    const y = Math.sin(t * 2 + strand * .55) * (1.35 + strand * .3) + (rand() - .5) * spread * 2;
    const z = Math.sin(t) * radius * .72 + Math.cos(t * 3) * .5;
    targets.universe.set([x, y + .65, z], i * 3);
    targets.website.set(sampleStroke(website, rand), i * 3);
    if (i % 3 === 0) {
      const a = rand() * TAU, r = 1.3 + rand() * .32;
      targets.poster.set([Math.cos(a) * r, -.7 + Math.sin(a) * r, .3 + Math.sin(a * 2) * .5], i * 3);
    } else targets.poster.set(sampleStroke(poster, rand), i * 3);
    targets.video.set(sampleStroke(video, rand), i * 3);
    seeds[i] = rand();
    tones[i] = (Math.sin(t + strand * 1.5) + 1) * .5;
    sizes[i] = .65 + Math.pow(rand(), 3) * 1.8;
  }
  return { targets, seeds, tones, sizes };
}
