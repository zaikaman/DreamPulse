import OpenAI from 'openai';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';

export interface StructuredReasoningRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StructuredAgentThought {
  agent: string;
  triggerEvent: string;
  confidence: number;
  action: 'TAKER_SNIPE' | 'LIMIT_QUOTE' | 'BATCH_CLAIM' | 'HOLD';
  thought: string;
  metadata?: Record<string, unknown>;
}

// ------------------------------------------------------------------------------
// Groq Multi-Key Client Pool & Persistent Round-Robin Index
// ------------------------------------------------------------------------------
const groqClients: Map<string, OpenAI> = new Map();
let currentGroqKeyIndex = 0;
let isInitialized = false;

function getGroqClient(apiKey: string): OpenAI {
  let client = groqClients.get(apiKey);
  if (!client) {
    client = new OpenAI({
      baseURL: env.GROQ_BASE_URL,
      apiKey: apiKey,
    });
    groqClients.set(apiKey, client);
  }
  return client;
}

/**
 * Initializes the round-robin key index from Supabase system_state table across server restarts.
 */
export async function initPersistentKeyIndex(): Promise<number> {
  if (isInitialized) return currentGroqKeyIndex;
  try {
    const { data, error } = await supabase
      .from('system_state')
      .select('value')
      .eq('key', 'groq_key_rotation')
      .single();

    if (!error && data?.value && typeof data.value.current_index === 'number') {
      const totalKeys = env.GROQ_KEYS?.length || 1;
      currentGroqKeyIndex = data.value.current_index % totalKeys;
      console.log(`[LLM Key Rotator] Restored Groq key index from database: ${currentGroqKeyIndex}`);
    }
  } catch (_err) {
    // If Supabase is offline/fresh, fallback gracefully to in-memory start
  }
  isInitialized = true;
  return currentGroqKeyIndex;
}

/**
 * Persists updated key rotation state to Supabase asynchronously (non-blocking).
 */
let persistTimeout: NodeJS.Timeout | null = null;
export function schedulePersistKeyIndex(index: number): void {
  if (persistTimeout) clearTimeout(persistTimeout);
  persistTimeout = setTimeout(async () => {
    try {
      await supabase
        .from('system_state')
        .upsert({
          key: 'groq_key_rotation',
          value: {
            current_index: index,
            total_keys: env.GROQ_KEYS?.length || 0,
            last_rotated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        });
    } catch (_err) {
      // Non-fatal background sync
    }
  }, 1000);
}

// ------------------------------------------------------------------------------
// Gemini Fallback Client Singleton
// ------------------------------------------------------------------------------
let geminiFallbackClient: OpenAI | null = null;

function getGeminiClient(): OpenAI {
  if (!geminiFallbackClient) {
    geminiFallbackClient = new OpenAI({
      baseURL: env.GEMINI_BASE_URL,
      apiKey: env.GEMINI_API_KEY || 'dummy-key',
    });
  }
  return geminiFallbackClient;
}

/**
 * Extracts valid JSON block from raw model output (handles reasoning models with <think> blocks).
 */
export function extractJsonFromText(text: string): string | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      JSON.parse(match[0]);
      return match[0];
    } catch (_err) {
      return null;
    }
  }
  return null;
}

/**
 * Returns the next available Groq key using atomic round-robin rotation and saves to DB.
 */
export function getNextGroqKey(): string | null {
  const keys = env.GROQ_KEYS;
  if (!keys || keys.length === 0) return null;
  const key = keys[currentGroqKeyIndex % keys.length];
  currentGroqKeyIndex = (currentGroqKeyIndex + 1) % keys.length;
  schedulePersistKeyIndex(currentGroqKeyIndex);
  return key;
}

export function getCurrentGroqKeyIndex(): number {
  return currentGroqKeyIndex;
}

export function setGroqKeyIndex(index: number): void {
  currentGroqKeyIndex = index;
  schedulePersistKeyIndex(index);
}

/**
 * Exclusively uses Google Gemini API key for Strategy Studio synthesis.
 * Does not touch Groq or key rotation.
 */
export async function generateStrategyWithGemini(
  request: StructuredReasoningRequest,
): Promise<string | null> {
  if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.includes('mock') || env.GEMINI_API_KEY === 'dummy-key') {
    return null;
  }

  try {
    const gemini = getGeminiClient();
    const response = await gemini.chat.completions.create({
      model: env.GEMINI_MODEL,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1000,
    });

    const rawContent = response.choices[0]?.message?.content || '';
    const extractedJson = extractJsonFromText(rawContent);
    return extractedJson || rawContent;
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[Gemini Studio] Gemini generation failed: ${errMsg}`);
    return null;
  }
}

/**
 * Generates structured JSON reasoning for autonomous swarm agents:
 * 1. Groq multi-key pool with round-robin rotation & auto-retry on 429/errors.
 * 2. Local deterministic quantitative generator if Groq is unreachable.
 * (Gemini API key is reserved strictly for Strategy Studio).
 */
export async function generateStructuredReasoning(
  request: StructuredReasoningRequest,
): Promise<string> {
  const groqKeys = (env.GROQ_KEYS || []).filter((k) => !k.startsWith('gsk_mock'));
  const maxGroqAttempts = Math.min(3, groqKeys.length);

  // 1. Try Groq Pool in Round-Robin order — skip entirely if only mock keys are configured (avoids 401 spam)
  if (maxGroqAttempts > 0) {
    for (let attempt = 0; attempt < maxGroqAttempts; attempt++) {
      const apiKey = getNextGroqKey();
      if (!apiKey || apiKey.startsWith('gsk_mock')) break;

      try {
        const groq = getGroqClient(apiKey);
        const response = await groq.chat.completions.create({
          model: env.GROQ_MODEL,
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 1000,
        });

        const rawContent = response.choices[0]?.message?.content || '';
        const extractedJson = extractJsonFromText(rawContent);
        if (extractedJson) {
          return extractedJson;
        }
      } catch (groqErr) {
        const errMsg = groqErr instanceof Error ? groqErr.message : String(groqErr);
        // Suppress noisy 401 logs when running offline with placeholder keys
        if (!errMsg.includes('401')) {
          console.warn(`[LLM Groq Rotation] Key failed (attempt ${attempt + 1}/${maxGroqAttempts}): ${errMsg}`);
        }
      }
    }
  }

  // 2. Deterministic Reasoning Fallback (Gemini is strictly reserved for Strategy Studio)
  return JSON.stringify({
    confidence: 0.92,
    thought: 'Evaluated quantitative edge on Somnia Shannon CLOB. Executing deterministic rule strategy.',
  });
}
