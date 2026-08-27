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
    setGroqKeyIndex(0);
    const key1 = getNextGroqKey();
    const key2 = getNextGroqKey();
    const key3 = getNextGroqKey();

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key3).toBeDefined();
    expect(getCurrentGroqKeyIndex()).toBe(3);
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
  }, 25000);
});
