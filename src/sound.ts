/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

class ArcadeSoundEngine {
  private ctx: AudioContext | null = null;
  private master: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private unlocked = false;
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('rcmute') === '1';
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('rcmute', this.muted ? '1' : '0');
    } catch {
      // ignore storage errors
    }
    if (!this.muted) {
      this.unlock();
      this.playUiTap();
    }
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as WebkitWindow).webkitAudioContext;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -10;
      this.master.knee.value = 12;
      this.master.ratio.value = 8;
      this.master.attack.value = 0.002;
      this.master.release.value = 0.12;
      this.master.connect(this.ctx.destination);

      // Pre-build reusable 0.25s white noise buffer for jet thrust & crash percussion
      const length = Math.floor(this.ctx.sampleRate * 0.25);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {
        // Ignore until next user gesture
      });
    }

    return this.ctx;
  }

  /**
   * Unlocks Web Audio on iOS Safari & Android Chrome inside a direct user gesture.
   */
  public unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.unlocked) return;

    try {
      const silent = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
      this.unlocked = true;
    } catch {
      // ignore
    }
  }

  /**
   * Snappy cyber-jetpack jump/flap sound when tapping in gameplay.
   */
  public playFlap(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;

    // 1. Rising arcade synth chirp
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.085);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.1);

    // 2. Subtle high-tech jet burst
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.Q.setValueAtTime(1.8, now);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.06, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.master);
      noise.start(now);
      noise.stop(now + 0.05);
    }
  }

  /**
   * Crisp futuristic button blip when tapping menu / retry / back buttons.
   */
  public playUiTap(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(780, now + 0.032);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /**
   * Bright two-tone arcade pickup chime when clearing a gate.
   */
  public playScore(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1318.5, now + 0.055); // E6

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /**
   * Classic arcade collision impact + descending cyber "System Crash" fail jingle.
   */
  public playFail(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master) return;

    const now = ctx.currentTime;

    // 1. Punchy collision thud
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(170, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.18);

    subGain.gain.setValueAtTime(0.35, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    sub.connect(subGain);
    subGain.connect(this.master);
    sub.start(now);
    sub.stop(now + 0.2);

    // 2. Metallic crunch burst
    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(220, now + 0.16);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.26, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.master);
      noise.start(now);
      noise.stop(now + 0.18);
    }

    // 3. Descending 3-note retro-cyber game-over synth
    const notes: [number, number, number][] = [
      [392.0, 0.05, 0.11], // G4
      [311.1, 0.16, 0.11], // Eb4
      [233.1, 0.27, 0.24], // Bb3 -> slides down
    ];

    notes.forEach(([freq, offset, dur], idx) => {
      if (!this.master) return;
      const start = now + offset;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      if (idx === 2) {
        osc.frequency.exponentialRampToValueAtTime(110, start + dur);
      }

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1350, start);
      filter.frequency.exponentialRampToValueAtTime(340, start + dur);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      osc.start(start);
      osc.stop(start + dur + 0.01);
    });
  }
}

export const sound = new ArcadeSoundEngine();
