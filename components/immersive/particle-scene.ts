import * as THREE from "three";
import type { RefObject } from "react";
import { createParticleData } from "./particle-data";
import { FIELD_WORLD_HEIGHT, FIELD_WORLD_WIDTH, LiquidField } from "@/lib/liquid-field";

export type SceneInput = {
  progress: number; pointerX: number; pointerY: number; paused: boolean; reduced: boolean;
  magnetism: number; focus: number; converge: number;
};
export type SceneHandle = { dispose: () => void; addTypography: () => void; ripple: (x: number, y: number, strength?: number) => void };

const waves = /* glsl */ `
  uniform sampler2D uField;
  uniform vec2 uPointer;
  uniform float uMagnetism;
  uniform float uFocus;
  uniform float uConverge;
  uniform float uOpacity;
  float liquidHeight(vec2 point) {
    vec2 uv = point / vec2(${FIELD_WORLD_WIDTH.toFixed(1)}, ${FIELD_WORLD_HEIGHT.toFixed(1)}) + .5;
    if (uv.x < .005 || uv.x > .995 || uv.y < .005 || uv.y > .995) return 0.0;
    return (texture2D(uField, uv).r - ${(128 / 255).toFixed(8)}) * 2.0;
  }
  vec3 interact(vec3 point, float seed, float free) {
    vec2 delta = point.xy - uPointer;
    float field = exp(-dot(delta, delta) / 5.2);
    // A damped, coherent field rather than independent random particle motion.
    point.xy += delta * (-.14 * field * uMagnetism * free);
    point.xy += vec2(-delta.y, delta.x) * field * .085 * uMagnetism * free;
    point.z += field * .46 * uMagnetism * free;
    vec2 uv = point.xy / vec2(${FIELD_WORLD_WIDTH.toFixed(1)}, ${FIELD_WORLD_HEIGHT.toFixed(1)}) + .5;
    float h = liquidHeight(point.xy);
    float hx = liquidHeight(point.xy + vec2(.16, 0.0)) - liquidHeight(point.xy - vec2(.16, 0.0));
    float hy = liquidHeight(point.xy + vec2(0.0, .16)) - liquidHeight(point.xy - vec2(0.0, .16));
    point.z += h * .8 * free;
    point.xy += vec2(hx, hy) * .95 * free;
    float beam = smoothstep(.15, 1.0, uConverge);
    vec3 orbit = vec3(cos(seed * 43.0) * .8, sin(seed * 43.0) * .55, sin(seed * 71.0) * .5);
    point = mix(point, orbit, beam * (.5 + seed * .3));
    point.xy = mix(point.xy, point.xy * vec2(.82, .78) + vec2(2.8, -.45) * .18, uFocus * free);
    return point;
  }
`;

const vertex = /* glsl */ `
  attribute vec3 aWebsite;
  attribute vec3 aPoster;
  attribute vec3 aVideo;
  attribute float aSeed;
  attribute float aTone;
  attribute float aSize;
  uniform float uTime;
  uniform float uProgress;
  uniform float uDpr;
  varying vec3 vColor;
  varying float vAlpha;
  ${waves}
  void main() {
    float p = clamp(uProgress, 0.0, 3.0);
    vec3 target;
    if (p < 1.0) target = mix(position, aWebsite, smoothstep(0.0, 1.0, p));
    else if (p < 2.0) target = mix(aWebsite, aPoster, smoothstep(0.0, 1.0, p - 1.0));
    else target = mix(aPoster, aVideo, smoothstep(0.0, 1.0, p - 2.0));
    float free = 1.0 - smoothstep(0.0, 0.92, p);
    // The coherent flow dies away as an artifact resolves, leaving readable geometry.
    target.y += sin(target.x * .52 + uTime * .3 + aSeed * 2.0) * (.025 + free * .2);
    target.x += cos(target.z * .58 + uTime * .2) * (.012 + free * .11);
    target.z += sin(target.y * .55 + uTime * .22 + aSeed) * free * .2;
    target = interact(target, aSeed, free);
    vec4 mv = modelViewMatrix * vec4(target, 1.0);
    gl_Position = projectionMatrix * mv;
    float defocus = abs(mv.z + 15.0) / 10.0;
    gl_PointSize = clamp((aSize + defocus * .5) * uDpr * 21.0 / -mv.z, 1.0, 5.0);
    vec3 pink = vec3(.92,.51,.67);
    vec3 violet = vec3(.63,.53,.94);
    vec3 mint = vec3(.48,.85,.71);
    vec3 cyan = vec3(.42,.70,.79);
    vColor = aTone < .33 ? mix(pink, violet, aTone * 3.0) : aTone < .66 ? mix(violet, cyan, (aTone - .33) * 3.0) : mix(cyan, mint, (aTone - .66) * 3.0);
    float waveLight = liquidHeight(target.xy);
    vColor = mix(vColor, vec3(.83,.88,.96), clamp(abs(waveLight) * .32, 0.0, .45));
    vAlpha = (.36 + aSeed * .54) * (1.0 - defocus * .25);
  }
`;
const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - .5);
    if (r > .5) discard;
    float glow = 1.0 - smoothstep(.08, .5, r);
    gl_FragColor = vec4(vColor * (.82 + glow * .2), glow * vAlpha);
  }
`;

// An analytic studio environment gives the liquid core depth without external HDR assets.
const coreVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  ${waves}
  void main() {
    vec3 p = position;
    float swell = sin(p.y * 2.8 + uTime * .38) * cos(p.x * 2.2 - uTime * .24) * .075;
    p += normal * (swell + liquidHeight(p.xy + vec2(1.0, .4)) * .12);
    p = interact(p, .43, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vWorld = (modelMatrix * vec4(p, 1.0)).xyz;
    vLocal = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const coreFragment = /* glsl */ `
  uniform float uTime;
  uniform float uConverge;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 eye = normalize(cameraPosition - vWorld);
    vec3 reflected = reflect(-eye, n);
    float fresnel = pow(1.0 - max(dot(n, eye), 0.0), 2.7);
    float bands = .5 + .5 * sin(reflected.y * 7.0 + reflected.x * 3.5 + vLocal.y * .55);
    float studio = pow(max(dot(reflected, normalize(vec3(-.5, .8, .5))), 0.0), 14.0);
    vec3 dark = vec3(.065,.075,.105);
    vec3 lilac = vec3(.43,.39,.59);
    vec3 mint = vec3(.42,.63,.57);
    vec3 color = mix(dark, mix(lilac, mint, bands), .34 + fresnel * .44);
    color += studio * vec3(.48,.47,.55) + fresnel * vec3(.10,.09,.16);
    gl_FragColor = vec4(color, (1.0 - uConverge) * uOpacity);
  }
`;

export function createParticleScene(canvas: HTMLCanvasElement, host: HTMLElement, input: RefObject<SceneInput>, onFailure: () => void): SceneHandle {
  // Probe the one canvas context; never create a second fluid or typography canvas context.
  const context = canvas.getContext("webgl2", { alpha: true, antialias: false, powerPreference: "low-power" });
  if (!context) throw new Error("WebGL2 unavailable");
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: false });
  const narrow = window.matchMedia("(max-width: 700px)").matches;
  const count = narrow ? 12000 : 48000;
  const data = createParticleData(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(data.targets.universe, 3));
  geometry.setAttribute("aWebsite", new THREE.BufferAttribute(data.targets.website, 3));
  geometry.setAttribute("aPoster", new THREE.BufferAttribute(data.targets.poster, 3));
  geometry.setAttribute("aVideo", new THREE.BufferAttribute(data.targets.video, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(data.seeds, 1));
  geometry.setAttribute("aTone", new THREE.BufferAttribute(data.tones, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(data.sizes, 1));
  let dpr = Math.min(window.devicePixelRatio || 1, narrow ? 1.25 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0, 0);
  const field = new LiquidField();
  const fieldTexture = new THREE.DataTexture(field.pixels, field.width, field.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  fieldTexture.minFilter = THREE.LinearFilter; fieldTexture.magFilter = THREE.LinearFilter;
  fieldTexture.needsUpdate = true;
  const shared = {
    uTime: { value: 0 }, uField: { value: fieldTexture }, uPointer: { value: new THREE.Vector2(100, 100) },
    uMagnetism: { value: .7 }, uFocus: { value: 0 }, uConverge: { value: 0 }, uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, uniforms: { ...shared, uProgress: { value: 0 }, uDpr: { value: dpr } } });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);
  const coreGeometry = new THREE.IcosahedronGeometry(1, 3);
  const coreMaterial = new THREE.ShaderMaterial({ vertexShader: coreVertex, fragmentShader: coreFragment, uniforms: shared, transparent: true });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.position.set(.8, .7, -.25); core.scale.set(1.15, 1.35, .85); core.rotation.set(.3, -.4, -.3);
  scene.add(core);
  const typography = new THREE.Group();
  scene.add(typography);
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 80);
  camera.position.z = 15;
  const textResources: { geometry: THREE.BufferGeometry; material: THREE.MeshBasicMaterial; texture: THREE.CanvasTexture }[] = [];
  let disposed = false, contextLost = false, inView = true, raf = 0, last = 0, time = 0;
  let progress = input.current.progress, px = 0, py = 0, previousProgress = -1;
  let focus = 0, converge = 0, fieldAccumulator = 0;
  let frames = 0, slowFrames = 0;
  let lastPointer = input.current.pointerX, lastPointerY = input.current.pointerY;
  renderer.debug.onShaderError = () => {
    contextLost = true;
    cancelAnimationFrame(raf); raf = 0;
    onFailure();
  };

  const resize = () => {
    if (disposed) return;
    const width = host.clientWidth, height = host.clientHeight;
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height);
    camera.position.z = camera.aspect < 1 ? 22 / camera.aspect * .65 : 15;
    core.position.set(camera.aspect < .8 ? .9 : 4.2, -1.6, -.25);
    camera.updateProjectionMatrix();
    last = 0;
    wake();
  };

  function draw(now: number) {
    raf = 0;
    if (disposed || contextLost || !inView || document.hidden) { last = 0; return; }
    const state = input.current;
    const still = state.reduced || state.paused;
    const delta = last ? Math.min((now - last) / 1000, .06) : .016;
    const cap = narrow ? 1 / 30 : 1 / 60;
    if (!still && last && (now - last) / 1000 < cap - .002) { raf = requestAnimationFrame(draw); return; }
    if (!still) time += delta;
    const easing = still ? 1 : 1 - Math.exp(-delta * 7);
    const liquidEase = still ? 1 : 1 - Math.exp(-delta * 2.4);
    progress += (state.progress - progress) * easing;
    px += ((still ? 0 : state.pointerX) - px) * liquidEase;
    py += ((still ? 0 : state.pointerY) - py) * liquidEase;
    focus += (state.focus - focus) * liquidEase;
    converge += (state.converge - converge) * easing;
    const pointerTravel = Math.hypot(state.pointerX - lastPointer, state.pointerY - lastPointerY);
    lastPointer = state.pointerX; lastPointerY = state.pointerY;
    if (!still && pointerTravel > .001) field.splash(px * FIELD_WORLD_WIDTH * .5, py * FIELD_WORLD_HEIGHT * .5, Math.min(.085, pointerTravel * .24), .85);
    fieldAccumulator += delta;
    if (!still && fieldAccumulator >= 1 / 30) {
      if (field.step(fieldAccumulator)) fieldTexture.needsUpdate = true;
      fieldAccumulator = 0;
    }
    shared.uTime.value = time;
    shared.uPointer.value.set(px * FIELD_WORLD_WIDTH * .5, py * FIELD_WORLD_HEIGHT * .5);
    shared.uMagnetism.value = still ? 0 : state.magnetism;
    shared.uFocus.value = focus;
    shared.uConverge.value = converge;
    material.uniforms.uProgress.value = progress;
    const formed = THREE.MathUtils.smoothstep(progress, .1, .9);
    group.rotation.set(py * .035 + formed * -.06, px * .06 + formed * -.12, Math.sin(time * .06) * .025 * (1 - formed));
    group.position.set(formed * (camera.aspect > 1.2 ? 1.25 : 0), formed * (camera.aspect < .8 ? -2.0 : .15), 0);
    const coreVisibility = 1 - THREE.MathUtils.smoothstep(progress, .1, .65);
    shared.uOpacity.value = coreVisibility;
    core.visible = coreVisibility > .01 && converge < .99;
    core.rotation.y = -.4 + Math.sin(time * .12) * .16 + px * .08;
    core.rotation.x = .3 + py * .05;
    const coreScale = .63 + focus * .04;
    core.scale.set(1.15 * coreScale, 1.35 * coreScale, .85 * coreScale);
    // Keep typography small and away from the central content safe zone.
    typography.rotation.y = Math.sin(time * .12) * .18 + px * .035;
    typography.rotation.z = -.065 + py * .01;
    for (const resource of textResources) resource.material.opacity = .11 * (1 - THREE.MathUtils.smoothstep(progress, 0, .7));
    renderer.render(scene, camera);
    canvas.dataset.progress = progress.toFixed(3);
    canvas.dataset.particles = String(Math.min(count, geometry.drawRange.count));
    canvas.dataset.pointer = `${px.toFixed(3)},${py.toFixed(3)}`;
    canvas.dataset.dpr = dpr.toFixed(2);
    canvas.dataset.time = time.toFixed(3);
    canvas.dataset.field = field.needsUpdate ? "active" : "settled";
    canvas.dataset.focus = focus.toFixed(3);
    last = now;
    previousProgress = state.progress;
    // Measure frame cost over a bounded window and only step quality down.
    if (!still && frames < 180) {
      frames++; if (delta > .037) slowFrames++;
      if (frames === 180 && slowFrames > 55) {
        dpr = 1; renderer.setPixelRatio(1); material.uniforms.uDpr.value = 1;
        geometry.setDrawRange(0, Math.floor(count * .65));
      }
    }
    if (!still && !contextLost) raf = requestAnimationFrame(draw);
  }
  function wake() { if (!disposed && !raf && !contextLost) raf = requestAnimationFrame(draw); }
  function ripple(x: number, y: number, strength = 1) {
    if (input.current.reduced) return;
    field.splash(x, y, strength, 1.05);
    fieldTexture.needsUpdate = true;
    wake();
  }
  const onScroll = () => { if (previousProgress !== input.current.progress) wake(); };
  const onVisibility = () => { if (!document.hidden) wake(); };
  const onSettings = () => wake();
  const lost = (event: Event) => { event.preventDefault(); contextLost = true; cancelAnimationFrame(raf); raf = 0; onFailure(); };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    if (inView) wake(); else { cancelAnimationFrame(raf); raf = 0; last = 0; }
  });
  intersection.observe(host);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("morph-settings", onSettings);
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", lost);
  resize();

  function addTypography() {
    if (disposed || textResources.length) return;
    const phrases = ["IMAGINE  /  CREATE  /  REMAKE", "ONE IDEA.  MANY POSSIBLE WORLDS."];
    phrases.forEach((phrase, index) => {
      const textureCanvas = document.createElement("canvas");
      textureCanvas.width = 1536; textureCanvas.height = 100;
      const ctx = textureCanvas.getContext("2d");
      if (!ctx) return;
      ctx.font = '500 43px "Geist Variable", sans-serif';
      ctx.fillStyle = "#b8b2c4"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(phrase, 768, 50, 1460);
      const texture = new THREE.CanvasTexture(textureCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      const textGeometry = new THREE.PlaneGeometry(14.5, .95, 80, 1);
      const pos = textGeometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), angle = x / 8;
        pos.setXYZ(i, Math.sin(angle) * 8, pos.getY(i), (Math.cos(angle) - 1) * 8);
      }
      pos.needsUpdate = true;
      const textMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .11, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(textGeometry, textMaterial);
      mesh.position.set(index ? .8 : -.8, index ? -4.65 : 4.6, -2.5);
      mesh.rotation.y = index ? -.2 : .2;
      typography.add(mesh);
      textResources.push({ geometry: textGeometry, material: textMaterial, texture });
    });
    wake();
  }
  function dispose() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(raf);
    resizeObserver.disconnect(); intersection.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("morph-settings", onSettings);
    document.removeEventListener("visibilitychange", onVisibility);
    canvas.removeEventListener("webglcontextlost", lost);
    geometry.dispose(); material.dispose(); coreGeometry.dispose(); coreMaterial.dispose();
    field.dispose(); fieldTexture.dispose();
    textResources.forEach((r) => { r.geometry.dispose(); r.material.dispose(); r.texture.dispose(); });
    renderer.dispose(); renderer.forceContextLoss();
  }
  return { addTypography, dispose, ripple };
}
