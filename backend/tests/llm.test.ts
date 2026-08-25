import { describe, it, expect } from 'vitest';
import {
  getNextGroqKey,
  getCurrentGroqKeyIndex,
  setGroqKeyIndex,
  initPersistentKeyIndex,
} from '../src/llm/client.js';
import { generateAgentThought } from '../src/llm/reasoning-service.js';

describe('Groq Multi-Key Round-Robin & Fallback System', () => {
  it('rotates through Groq API keys in sequential round-robin order', () => {
    const initialIndex = getCurrentGroqKeyIndex();
    const key1 = getNextGroqKey();
    const key2 = getNextGroqKey();
    const key3 = getNextGroqKey();

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key3).toBeDefined();
    expect(getCurrentGroqKeyIndex()).toBe((initialIndex + 3) % 20);
  });

  it('can set and restore key index gracefully', async () => {
    setGroqKeyIndex(7);
    expect(getCurrentGroqKeyIndex()).toBe(7);

    const index = await initPersistentKeyIndex();
    expect(typeof index).toBe('number');
  });

  it('generates structured JSON agent thought logs', async () => {
    const thought = await generateAgentThought({
      agentType: 'Volt',
      symbol: 'BTC/USD',
      spotPrice: 96500.0,
      strikePrice: 96000.0,
      timeLeftSeconds: 120,
      bestBidYes: 0.48,
      bestAskYes: 0.50,
      impliedProbYes: 0.49,
      fairValueYes: 0.58,
      edgePercentage: 0.09,
      driftPercentage: 0.0035,
      triggerEvent: 'SPOT_DRIFT',
      actionPlanned: 'TAKER_SNIPE',
    });

    expect(thought).toHaveProperty('agent', 'Volt');
    expect(thought).toHaveProperty('action');
    expect(thought).toHaveProperty('confidence');
    expect(thought).toHaveProperty('thought');
    expect(thought.confidence).toBeGreaterThanOrEqual(0.6);
    expect(thought.thought.length).toBeGreaterThan(10);
  });
});
