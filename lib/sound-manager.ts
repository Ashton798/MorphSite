/** Original procedural UI sounds; no samples or third-party audio assets. */
export const SOUND_STORAGE_KEY = "morphsite.sound.v1";
export type SoundCue = "tap" | "ripple" | "whoosh" | "success";
export type SoundSettings = { muted: boolean; volume: number };
export const DEFAULT_SOUND: SoundSettings = { muted: true, volume: 0.16 };

export function readSoundSettings(storage?: Storage | null): SoundSettings {
  try {
    const raw = storage?.getItem(SOUND_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOUND };
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return {
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_SOUND.muted,
      volume: typeof parsed.volume === "number" && Number.isFinite(parsed.volume) ? Math.min(0.35, Math.max(0, parsed.volume)) : DEFAULT_SOUND.volume,
    };
  } catch { return { ...DEFAULT_SOUND }; }
}

class SoundManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sources = new Set<AudioScheduledSourceNode>();
  private settings: SoundSettings = { ...DEFAULT_SOUND };
  private listeners = new Set<(settings: SoundSettings) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private lastPlayed = new Map<SoundCue, number>();

  initialize(storage?: Storage | null) {
    let source = storage;
    if (source === undefined && typeof window !== "undefined") {
      try { source = window.localStorage; } catch { source = null; }
    }
    this.settings = readSoundSettings(source);
    this.notify();
    return { ...this.settings };
  }

  get snapshot() { return { ...this.settings }; }
  subscribe(listener: (settings: SoundSettings) => void) {
    this.listeners.add(listener); listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }
  private notify() { this.listeners.forEach((listener) => listener(this.snapshot)); }
  private persist() {
    try { localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* Audio still works when storage is blocked. */ }
    this.notify();
  }

  /** Called only from the explicit sound control or a real user gesture. */
  async unlock(): Promise<boolean> {
    if (typeof window === "undefined" || this.settings.muted) return false;
    try {
      if (!this.context) {
        const AudioContextClass = window.AudioContext;
        if (!AudioContextClass) return false;
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.compressor = this.context.createDynamicsCompressor();
        this.compressor.threshold.value = -20;
        this.compressor.ratio.value = 4;
        this.master.gain.value = 0;
        this.master.connect(this.compressor);
        this.compressor.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      this.updateMaster();
      return this.context.state === "running";
    } catch { return false; }
  }

  private updateMaster() {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const value = this.settings.muted || this.context.state !== "running" ? 0 : this.settings.volume;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(value, now, 0.018);
  }

  setMuted(muted: boolean) {
    this.settings.muted = muted;
    if (muted) this.stopAll();
    this.persist();
  }
  setVolume(volume: number) {
    this.settings.volume = Math.min(0.35, Math.max(0, volume));
    if (this.settings.volume === 0) this.stopAll();
    this.updateMaster();
    this.persist();
  }

  private tone(frequency: number, duration: number, start: number, level: number, type: OscillatorType, endFrequency = frequency) {
    const ctx = this.context!, output = this.master!;
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + Math.min(.025, duration * .15));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope); envelope.connect(output);
    oscillator.start(start); oscillator.stop(start + duration + .02);
    this.track(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.sources.delete(oscillator); };
  }

  private noise(duration: number, start: number, level: number, frequency: number) {
    const ctx = this.context!, output = this.master!;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let last = 0;
    // Seeded, gently correlated noise avoids an aggressively bright click.
    let seed = 1024;
    for (let i = 0; i < channel.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = seed / 4294967296 * 2 - 1;
      last = last * .88 + white * .12;
      channel[i] = last;
    }
    const source = ctx.createBufferSource(); source.buffer = buffer;
    const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.setValueAtTime(frequency, start);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(level, start + .08);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(output);
    source.start(start); source.stop(start + duration + .02);
    this.track(source);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); this.sources.delete(source); };
  }

  private track(source: AudioScheduledSourceNode) { this.sources.add(source); }

  /** No context is created while muted. Repeated hover sounds are intentionally throttled. */
  async play(cue: SoundCue, fromGesture = false) {
    if (this.settings.muted || typeof window === "undefined") return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(cue) ?? -Infinity) < (cue === "tap" ? 75 : 140)) return;
    this.lastPlayed.set(cue, now);
    if (!this.context && !fromGesture) return;
    if (!(await this.unlock()) || this.settings.muted || !this.context) return;
    const start = this.context.currentTime + .008;
    if (cue === "tap") this.tone(680, .075, start, .15, "sine", 460);
    if (cue === "ripple") {
      this.tone(185, .7, start, .17, "sine", 65);
      this.noise(.5, start, .12, 850);
    }
    if (cue === "whoosh") {
      this.noise(.7, start, .3, 1800);
      this.tone(170, .62, start, .1, "sine", 620);
    }
    if (cue === "success") {
      [0, .12, .24].forEach((delay, index) => this.tone([523.25, 659.25, 783.99][index], .48, start + delay, .1, "sine"));
    }
  }

  stopAll() {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Already stopped. */ }
      try { source.disconnect(); } catch { /* No-op. */ }
    }
    this.sources.clear();
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(0, this.context.currentTime);
    }
  }

  dispose() {
    this.stopAll();
    this.timers.forEach(clearTimeout); this.timers.clear(); this.listeners.clear();
    this.master?.disconnect(); this.compressor?.disconnect();
    void this.context?.close();
    this.context = null; this.master = null; this.compressor = null;
  }
}

export const soundManager = new SoundManager();
