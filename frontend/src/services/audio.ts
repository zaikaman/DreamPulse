/**
 * Web Audio API procedural sound synthesizer for DreamPulse trading terminal.
 * Operates without external audio asset downloads, offering zero-latency feedback.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private lastThoughtSoundTime: number = 0;
  private lastExecutionSoundTime: number = 0;

  constructor() {
    // Check saved preference
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('dreampulse_audio_muted') : null;
      if (saved !== null) {
        this.isMuted = saved === 'true';
      }
    } catch {
      this.isMuted = false;
    }

    // Auto-unlock Web Audio context on first user gesture across browser environments
    if (typeof window !== 'undefined') {
      const unlock = () => {
        const ctx = this.initCtx();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      window.addEventListener('click', unlock, { passive: true });
    }
  }

  private initCtx(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    try {
      localStorage.setItem('dreampulse_audio_muted', String(this.isMuted));
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dreampulse:audio-mute-changed', { detail: { isMuted: this.isMuted } }));
      window.dispatchEvent(new Event('audio_mute_toggled'));
    }
    if (!this.isMuted) {
      // Affirmative chirp when unmuting
      this.playTradeFill();
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    if (this.isMuted === muted) return;
    this.isMuted = muted;
    try {
      localStorage.setItem('dreampulse_audio_muted', String(this.isMuted));
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dreampulse:audio-mute-changed', { detail: { isMuted: this.isMuted } }));
      window.dispatchEvent(new Event('audio_mute_toggled'));
    }
  }

  /**
   * Subtle, futuristic micro-tick cue when a real-time autonomous agent thought arrives.
   * Throttled with a 220ms cooldown to prevent audio distortion or cacophony during high-frequency telemetry bursts.
   */
  public playAgentThought(): void {
    if (this.isMuted) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastThoughtSoundTime < 220) return;
    this.lastThoughtSoundTime = now;

    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1450, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1950, ctx.currentTime + 0.03);

      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.035);
    } catch {}
  }

  /**
   * Crisp, authoritative dual-tone execution chime when a Swarm trade is placed on-chain.
   */
  public playAgentExecution(): void {
    if (this.isMuted) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastExecutionSoundTime < 120) return;
    this.lastExecutionSoundTime = now;

    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc1.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.05); // E6

      gain1.gain.setValueAtTime(0.09, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start();
      osc1.stop(ctx.currentTime + 0.08);
    } catch {}
  }

  /**
   * Crisp tick sound on order placement / trade fill.
   */
  public playTradeFill(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.04); // A6

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.06);
  }

  /**
   * Celebratory ascending harmonic chord on settlement payout sweep.
   */
  public playWinChime(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const frequencies = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 Major Chord
    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);

      const startTime = ctx.currentTime + idx * 0.08;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });
  }

  /**
   * Subtle alert sound when high-confidence pricing anomaly is detected.
   */
  public playAnomalyAlert(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  }

  /**
   * Dedicated tactile success chime for cloning algorithmic strategies.
   * Features a crisp leading transient followed by a bright ascending dual-tone harmonic shimmer.
   */
  public playCloneSuccess(): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Transient tick
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'sine';
    clickOsc.frequency.setValueAtTime(1046.5, now); // C6
    clickOsc.frequency.exponentialRampToValueAtTime(2093.0, now + 0.03); // C7
    clickGain.gain.setValueAtTime(0.12, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.04);

    // Ascending harmonic shimmer: G5 -> C6 -> E6
    const notes = [783.99, 1046.5, 1318.51];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      const startTime = now + 0.02 + idx * 0.05;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.12, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.22);
    });
  }

  /**
   * Dedicated tactile cue for enabling or disabling copy-trade mirroring.
   */
  public playCopyTradeToggle(enabled: boolean = true): void {
    if (this.isMuted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (enabled) {
      // Crisp affirmative ascending two-tone pulse (A5 -> E6)
      const tones = [880, 1318.51];
      tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        const startTime = now + idx * 0.06;
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.08, startTime + 0.08);

        gain.gain.setValueAtTime(0.14, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.14);
      });
    } else {
      // Soft downward dampening click for deactivation (A5 -> D5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.08);

      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    }
  }

  /**
   * Dedicated success chime for social actions and celebrations.
   */
  public playSuccessChime(): void {
    this.playCloneSuccess();
  }
}

export { SoundEngine };
export const soundEngine = new SoundEngine();

