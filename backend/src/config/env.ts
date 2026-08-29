import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
try {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  dotenv.config({ path: path.resolve(currentDir, '../../.env') });
  dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
} catch {
  // Ignore
}

// Extract all GROQ_API_KEY* variables from environment
const rawGroqKeys: string[] = [];
if (process.env.GROQ_API_KEY) rawGroqKeys.push(process.env.GROQ_API_KEY.trim());
for (let i = 2; i <= 50; i++) {
  const key = process.env[`GROQ_API_KEY_${i}`];
  if (key && key.trim()) {
    rawGroqKeys.push(key.trim());
  }
}

const defaultGroqKeys = ['gsk_mock_key_1', 'gsk_mock_key_2', 'gsk_mock_key_3', 'gsk_mock_key_4'];
const finalGroqKeys = rawGroqKeys.length > 0 ? rawGroqKeys : defaultGroqKeys;

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Supabase
  SUPABASE_URL: z.string().url().default('https://mock-project.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('mock-service-role-key'),
  SUPABASE_ANON_KEY: z.string().default('mock-anon-key'),

  // Groq LLM (Primary Pool with Round-Robin Rotation)
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().default('qwen/qwen3.6-27b'),
  GROQ_KEYS: z.array(z.string()).default(finalGroqKeys),

  // Gemini LLM (Exclusively for Strategy Studio Builder)
  GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
  GEMINI_API_KEY: z.string().default('mock-gemini-key'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),

  // Somnia Blockchain & Network
  NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  SOMNIA_RPC_URL: z.string().default('https://api.infra.testnet.somnia.network'),
  SOMNIA_WS_URL: z.string().default('wss://api.infra.testnet.somnia.network/ws'),
  INDEXER_URL: z.string().default('https://dev.smk.somnia.host/v1/graphql'),
  SOMNIA_CHAIN_ID: z.string().default('50312').transform((val) => parseInt(val, 10)),
  OPERATOR_PRIVATE_KEY: z.string().default('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  // Autonomous Swarm & Execution Control
  ENABLE_SWARM_RUNNER: z.preprocess((val) => {
    if (process.env.DISABLE_SWARM_RUNNER === 'true' || process.env.DISABLE_SWARM_RUNNER === '1') {
      return false;
    }
    if (val === 'false' || val === '0' || val === false) {
      return false;
    }
    return true;
  }, z.boolean()).default(true),
  DRY_RUN_MODE: z.preprocess((val) => {
    return val === 'true' || val === '1' || val === true;
  }, z.boolean()).default(false),

  // Security & Admin
  OPERATOR_ADMIN_SECRET: z.string().optional(),
  FRONTEND_ORIGIN: z.string().default('*'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_JWT_EXPIRY_SECONDS: z.coerce.number().default(86400),

  // Protocol addresses & APIs (Somnia Shannon Testnet)
  REST_API_URL: z.string().default('https://stg.api.dreamdex.io/v0'),
  DREAMDEX_REGISTRY_ADDRESS: z.string().default('0x3ecC694Cef705358864a646142ac17A90E29e388'),
  OPERATOR_PERMISSIONS_REGISTRY_ADDRESS: z.string().default('0x15C7e8CE38F021c5b45d098AaD788f63090bF20A'),
  DREAMDEX_VENUE_ID: z.string().default('0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c'),
});

export const env = envSchema.parse({
  ...process.env,
  SOMNIA_RPC_URL: process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://api.infra.testnet.somnia.network',
  SOMNIA_WS_URL: process.env.SOMNIA_WS_URL || process.env.WS_RPC_URL || 'wss://api.infra.testnet.somnia.network/ws',
  INDEXER_URL: process.env.INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql',
  OPERATOR_PRIVATE_KEY: process.env.OPERATOR_PRIVATE_KEY || process.env.PRIVATE_KEY || '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  GROQ_KEYS: finalGroqKeys,
});

