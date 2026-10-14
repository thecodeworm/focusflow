// Offline focus sounds generated with the Web Audio API. A few seconds of
// noise are rendered once into a buffer and looped, so playback costs almost
// nothing. The AudioContext is suspended whenever nothing is playing.

export type NoiseKind = "white" | "pink" | "brown";

const SECONDS = 8;
const FADE = 0.35;

function render(kind: NoiseKind, rate: number): Float32Array<ArrayBuffer> {
  const n = rate * SECONDS;
  const out = new Float32Array(n);
  if (kind === "white") {
    for (let i = 0; i < n; i++) out[i] = Math.random() * 2 - 1;
  } else if (kind === "pink") {
    // Paul Kellet's refined pink filter.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      out[i] = last;
    }
  }
  // Remove DC offset and normalise.
  let mean = 0;
  for (let i = 0; i < n; i++) mean += out[i]!;
  mean /= n;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    out[i]! -= mean;
    peak = Math.max(peak, Math.abs(out[i]!));
  }
  const gain = 0.9 / (peak || 1);
  // Crossfade the loop seam so it never clicks.
  const xf = Math.floor(rate * 0.25);
  for (let i = 0; i < n; i++) out[i]! *= gain;
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    const tail = n - xf + i;
    out[i] = out[i]! * t + out[tail]! * (1 - t);
  }
  return out.slice(0, n - xf);
}

class FocusSounds {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffers = new Map<NoiseKind, AudioBuffer>();
  private volume = 0.35;
  current: NoiseKind | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "playback" });
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private buffer(kind: NoiseKind): AudioBuffer {
    const ctx = this.ensure();
    let b = this.buffers.get(kind);
    if (!b) {
      const data = render(kind, ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data, 0);
      this.buffers.set(kind, b);
    }
    return b;
  }

  private level(v: number) {
    // Perceptual curve; noise is loud, keep the top end gentle.
    return Math.pow(Math.min(1, Math.max(0, v)), 1.8) * 0.6;
  }

  async play(kind: NoiseKind): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
    this.stopSource(0.15);
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(kind);
    src.loop = true;
    src.connect(this.gain!);
    src.start();
    this.source = src;
    this.current = kind;
    const g = this.gain!.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(this.level(this.volume), ctx.currentTime + FADE);
  }

  private stopSource(fade: number) {
    const ctx = this.ctx;
    const src = this.source;
    if (!ctx || !src) return;
    this.source = null;
    const g = this.gain!.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + fade);
    src.stop(ctx.currentTime + fade + 0.02);
    src.onended = () => src.disconnect();
  }

  stop() {
    this.stopSource(FADE);
    const ctx = this.ctx;
    // Free the audio thread when idle.
    window.setTimeout(() => {
      if (!this.source && ctx && ctx.state === "running") void ctx.suspend();
    }, (FADE + 0.1) * 1000);
  }

  get playing() {
    return this.source !== null;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx && this.gain && this.source) {
      const g = this.gain.gain;
      g.cancelScheduledValues(this.ctx.currentTime);
      g.setTargetAtTime(this.level(v), this.ctx.currentTime, 0.05);
    }
  }
}

export const focusSounds = new FocusSounds();
