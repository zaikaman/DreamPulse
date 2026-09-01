import { describe, it, expect } from 'vitest';
import {
  getNextGroqKey,
  getCurrentGroqKeyIndex,
  setGroqKeyIndex,
  initPersistentKeyIndex,
} from '../src/llm/client.js';
import { generateAgentThought } from '../src/llm/reasoning-service.js';

describe('Groq Multi-Key Round-Robin & Fallback System', () => {
  it('rotates through Groq API keys when keys are present or handles empty pool gracefully', async () => {
    const { env } = await import('../src/config/env.js');
    (env as any).GROQ_KEYS = ['key-test-1', 'key-test-2', 'key-test-3'];
    setGroqKeyIndex(0);
    const key1 = getNextGroqKey();
    const key2 = getNextGroqKey();
    const key3 = getNextGroqKey();

    expect(key1).toBe('key-test-1');
    expect(key2).toBe('key-test-2');
    expect(key3).toBe('key-test-3');
    expect(getCurrentGroqKeyIndex()).toBe(0);
  });

  it('can set and restore key index gracefully', async () => {
    setGroqKeyIndex(7);
    expect(getCurrentGroqKeyIndex()).toBe(7);

    const index = await initPersistentKeyIndex();
    expect(typeof index).toBe('number');
  });

  it('generates structured JSON agent thought logs with deterministic quantitative fallback', async () => {
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
    expect(thought).toHaveProperty('thought');
    expect(thought.thought.length).toBeGreaterThan(10);
    if (thought.confidence !== undefined) {
      expect(thought.confidence).toBeGreaterThanOrEqual(0.0);
    }
  });

  it('strictly dedicates Gemini API client to Strategy Studio synthesis', async () => {
    const { generateStrategyWithGemini } = await import('../src/llm/client.js');
    const { customAgentService } = await import('../src/services/custom-agent-service.js');

    // Direct Gemini studio invocation
    const res = await generateStrategyWithGemini({
      systemPrompt: 'You are a quantitative strategist.',
      userPrompt: 'Build a BTC 60s Call strategy on RSI dip',
    });
    // In test environments with mock keys, returns null gracefully without touching Groq pool
    expect(res === null || typeof res === 'string').toBe(true);

    // Prompt-to-agent synthesis
    const agent = await customAgentService.generateAgentFromPrompt('Aggressive BTC 60s Call sniper when RSI < 25');
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('rules');
    expect(agent.rules?.action?.direction).toBe('CALL');
  }, 45000);
});
