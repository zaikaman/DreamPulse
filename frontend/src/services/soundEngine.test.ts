import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoundEngine } from './audio.js';

describe('SoundEngine', () => {
  let engine: SoundEngine;
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;

  beforeEach(() => {
    localStorage.clear();
    mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    mockAudioContext = {
      state: 'running',
      currentTime: 0,
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    (window as any).AudioContext = vi.fn(() => mockAudioContext);
    engine = new SoundEngine();
  });

  it('initializes in unmuted state by default', () => {
    expect(engine.getMuted()).toBe(false);
  });

  it('toggles mute state and saves to localStorage', () => {
    expect(engine.toggleMute()).toBe(true);
    expect(engine.getMuted()).toBe(true);
    expect(localStorage.getItem('dreampulse_audio_muted')).toBe('true');

    expect(engine.toggleMute()).toBe(false);
    expect(engine.getMuted()).toBe(false);
    expect(localStorage.getItem('dreampulse_audio_muted')).toBe('false');
  });

  it('dispatches custom event when mute is toggled', () => {
    const listener = vi.fn();
    window.addEventListener('dreampulse:audio-mute-changed', listener);

    engine.setMuted(true);
    expect(listener).toHaveBeenCalled();

    window.removeEventListener('dreampulse:audio-mute-changed', listener);
  });

  it('plays agent thought sound when unmuted', () => {
    engine.playAgentThought();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();
  });

  it('throttles rapid agent thought calls to prevent audio distortion', () => {
    engine.playAgentThought();
    const callsAfterFirst = mockOscillator.start.mock.calls.length;

    // Immediately call again without advancing time
    engine.playAgentThought();
    expect(mockOscillator.start.mock.calls.length).toBe(callsAfterFirst);
  });

  it('plays agent execution chime on trade execution', () => {
    engine.playAgentExecution();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();
  });

  it('does not play sounds when muted', () => {
    engine.setMuted(true);
    engine.playAgentThought();
    engine.playAgentExecution();
    engine.playTradeFill();
    engine.playWinChime();
    engine.playAnomalyAlert();

    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
  });
});
