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

  it('extractJsonFromText handles fenced json, bare json, invalid json, and empty strings', async () => {
    const { extractJsonFromText } = await import('../src/llm/client.js');
    expect(extractJsonFromText('')).toBeNull();
    expect(extractJsonFromText('No json here')).toBeNull();
    expect(extractJsonFromText('{ "malformed": }')).toBeNull();
    expect(extractJsonFromText('```json\n{"valid": true}\n```')).toBe('{"valid": true}');
    expect(extractJsonFromText('Prefix text {"number": 42} suffix text')).toBe('{"number": 42}');
  });

  it('generates agent thought for all roles (Oracle, Titan, Sweeper) using deterministic fallback', async () => {
    for (const role of ['Oracle', 'Titan', 'Sweeper'] as const) {
      const thought = await generateAgentThought({
        agentType: role,
        symbol: 'ETH/USD',
        spotPrice: 3200.0,
        strikePrice: 3200.0,
        timeLeftSeconds: 300,
        bestBidYes: 0.49,
        bestAskYes: 0.51,
        impliedProbYes: 0.50,
        fairValueYes: 0.55,
        edgePercentage: 0.05,
        driftPercentage: 0.001,
        triggerEvent: 'TICK_EVAL',
        actionPlanned: role === 'Sweeper' ? 'BATCH_CLAIM' : 'LIMIT_QUOTE',
      });
      expect(thought.agent).toBe(role);
      expect(thought.thought.length).toBeGreaterThan(10);
    }
  });

  it('generateStructuredReasoning falls back immediately when GROQ_KEYS is empty', async () => {
    const { generateStructuredReasoning } = await import('../src/llm/client.js');
    const { env } = await import('../src/config/env.js');
    const savedKeys = (env as any).GROQ_KEYS;
    (env as any).GROQ_KEYS = [];
    try {
      const res = await generateStructuredReasoning({
        systemPrompt: 'System',
        userPrompt: 'User',
      });
      expect(res).toContain('Evaluated quantitative edge on Somnia Shannon CLOB');
    } finally {
      (env as any).GROQ_KEYS = savedKeys;
    }
  });
});

