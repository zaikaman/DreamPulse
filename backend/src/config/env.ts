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

const defaultGroqKeys: string[] = [];
const finalGroqKeys = rawGroqKeys;

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Supabase (Fail fast if credentials are not configured)
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY is required'),

  // Groq LLM (Primary Pool with Round-Robin Rotation - optional with deterministic agent fallback)
  GROQ_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  GROQ_MODEL: z.string().default('qwen/qwen3.8-27b'),
  GROQ_KEYS: z.array(z.string()).default(finalGroqKeys),

  // Gemini LLM (Exclusively for Strategy Studio Builder - optional)
  GEMINI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta/openai/'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),

  // Somnia Blockchain & Network
  NETWORK: z.enum(['testnet', 'mainnet']).default('testnet'),
  SOMNIA_RPC_URL: z.string().default('https://api.infra.testnet.somnia.network'),
  SOMNIA_WS_URL: z.string().default('wss://api.infra.testnet.somnia.network/ws'),
  INDEXER_URL: z.string().default('https://dev.smk.somnia.host/v1/graphql'),
  SOMNIA_CHAIN_ID: z.string().default('50312').transform((val) => parseInt(val, 10)),
  OPERATOR_PRIVATE_KEY: z.preprocess((val) => {
    if (typeof val !== 'string') return val;
    let cleaned = val.trim().replace(/^["']|["']$/g, '');
    if (/^[a-fA-F0-9]{64}$/.test(cleaned)) {
      cleaned = `0x${cleaned}`;
    }
    return cleaned;
  }, z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'OPERATOR_PRIVATE_KEY must be a valid 0x-prefixed 32-byte hex string')),

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
  FRONTEND_ORIGIN: z.preprocess((val) => {
    if (typeof val !== 'string' || !val.trim() || val.trim() === '*') {
      return 'https://dreampulse.vercel.app';
    }
    return val.trim().replace(/^["']|["']$/g, '');
  }, z.string().default('https://dreampulse.vercel.app')),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_JWT_EXPIRY_SECONDS: z.coerce.number().default(86400),

  // SEC-01: AES-256-GCM key for encrypting ephemeral session signing keys at
  // rest (sessions.session_key_private_key holds ciphertext only, never
  // plaintext). 64 hex chars preferred. Optional: when unset the relay runs
  // fail-closed (memory-only keys, NULL persisted) instead of leaking plaintext.
  SESSION_KEY_ENCRYPTION_KEY: z.string().optional(),

  // Protocol addresses & APIs (Somnia Shannon Testnet)
  REST_API_URL: z.string().default('https://stg.api.dreamdex.io/v0'),
  DREAMDEX_REGISTRY_ADDRESS: z.string().default('0x3ecC694Cef705358864a646142ac17A90E29e388'),
  OPERATOR_PERMISSIONS_REGISTRY_ADDRESS: z.string().default('0x15C7e8CE38F021c5b45d098AaD788f63090bF20A'),
  DREAMDEX_VENUE_ID: z.string().default('0x679795a0195a1b76cdebb7c51d74e058aee92919b8c3389af86ef24535e8a28c'),

  // Canonical Somnia / DreamDEX contract addresses. Single source of truth
  // for backend chain reads/writes — override via environment (local .env or
  // `heroku config:set -a dreampulse-backend`) instead of editing code.
  // Defaults track the Somnia Shannon Testnet deployments.
  SOMNIA_BINARY_MODULE: z.string().default('0x3ecC694Cef705358864a646142ac17A90E29e388'),
  SOMNIA_MARKETS_CORE: z.string().default('0x2802504314685D89bF6C992CA5a8e7cC78bc0294'),
  SOMNIA_CLOB_FACTORY: z.string().default('0xb2BE8EE02F96379DB75f01802384593EBa9bfF04'),
  SOMNIA_BINARY_POOL_IMPL: z.string().default('0x82A1FcdaA2daC2fC7D5f9909D43E68021eE966FD'),
  SOMNIA_BINARY_SETTLEMENT: z.string().default('0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23'),
  SOMNIA_COLLATERAL_ROUTER: z.string().default('0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C'),
  SOMNIA_MARKET_CREATOR_FACTORY: z.string().default('0xE6bEE93cE87c9E6e62aCb621caa7832EE47b4F6B'),
  SOMNIA_ORACLE_HUB: z.string().default('0xe40db387cC98601Dd11bd634fF2f3AD5686dE32b'),
  SOMNIA_MARKET_CREATOR: z.string().default('0x5Ce69567dB39C8fBAd7e048bEfdbcCdfE67B44e6'),
  SOMNIA_TEST_USDC: z.string().default('0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E'),
  // DreamPulse session contracts (updated on redeploy — see deploy scripts).
  SOMNIA_SESSION_ACCOUNT: z.string().default('0xa85ec9a6A0845eeb642E1DCE12780E9b4cFD37F8'),
  SOMNIA_SESSION_ACCOUNT_IMPL: z.string().default('0x6177d1E24C838789c1367fC9B66Bcf689C6ff60F'),
  SOMNIA_SESSION_ACCOUNT_FACTORY: z.string().default('0xA0C2eaAe0438bCB6DD0FA2Cc2317BEDB8Ff25e94'),
  // Pre-SEC-03 factory, kept for migration grace-period checks only.
  SOMNIA_SESSION_ACCOUNT_FACTORY_LEGACY: z.string().default('0xf45589660652962a381c8420125bc4be90362081'),
});

export const env = envSchema.parse({
  ...process.env,
  SOMNIA_RPC_URL: process.env.SOMNIA_RPC_URL || process.env.RPC_URL || 'https://api.infra.testnet.somnia.network',
  SOMNIA_WS_URL: process.env.SOMNIA_WS_URL || process.env.WS_RPC_URL || 'wss://api.infra.testnet.somnia.network/ws',
  INDEXER_URL: process.env.INDEXER_URL || 'https://dev.smk.somnia.host/v1/graphql',
  OPERATOR_PRIVATE_KEY: process.env.OPERATOR_PRIVATE_KEY || process.env.PRIVATE_KEY,
  GROQ_KEYS: finalGroqKeys,
});

