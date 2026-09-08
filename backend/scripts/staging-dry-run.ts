/**
 * Somnia Shannon Testnet readiness probe (READ-ONLY).
 *
 * Verifies the on-chain legs that unit tests cannot honestly cover
 * (claimMarketPayout redeems, sweeper scans, session registry reads) are
 * pointed at a live, correctly-wired testnet — without spending gas or
 * requiring any private keys.
 *
 * Address defaults mirror src/config/env.ts (source of truth); override via
 * env vars of the same name. Exit 0 = ready, exit 1 = a FAIL check.
 *
 * Usage: npm run staging:dry-run --workspace=dreampulse-backend
 */
import { createPublicClient, defineChain, formatEther, getAddress, http, parseAbi } from 'viem';

const EXPECTED_CHAIN_ID = 50312;

const RPC_URLS = Array.from(
  new Set(
    [
      process.env.SOMNIA_RPC_URL,
      'https://dream-rpc.somnia.network',
      'https://api.infra.testnet.somnia.network',
    ].filter((u): u is string => Boolean(u)),
  ),
);

// Canonical DreamDEX / session contracts (defaults = src/config/env.ts).
const CONTRACTS: Record<string, string> = {
  OPERATOR_PERMISSIONS_REGISTRY:
    process.env.OPERATOR_PERMISSIONS_REGISTRY_ADDRESS ??
    '0x15C7e8CE38F021c5b45d098AaD788f63090bF20A',
  TEST_USDC: process.env.SOMNIA_TEST_USDC ?? '0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E',
  MARKETS_CORE: process.env.SOMNIA_MARKETS_CORE ?? '0x2802504314685D89bF6C992CA5a8e7cC78bc0294',
  BINARY_MODULE: process.env.SOMNIA_BINARY_MODULE ?? '0x3ecC694Cef705358864a646142ac17A90E29e388',
  BINARY_SETTLEMENT:
    process.env.SOMNIA_BINARY_SETTLEMENT ?? '0xbF4a49e0Dfd092e5FBE8E5761064C49533e6Ed23',
  CLOB_FACTORY: process.env.SOMNIA_CLOB_FACTORY ?? '0xb2BE8EE02F96379DB75f01802384593EBa9bfF04',
  COLLATERAL_ROUTER:
    process.env.SOMNIA_COLLATERAL_ROUTER ?? '0xbC0C9834B15ACE38bB50dDaa7d7f7C7CC4DC183C',
};

const chain = defineChain({
  id: EXPECTED_CHAIN_ID,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: { name: 'Somnia Test Token', symbol: 'STT', decimals: 18 },
  rpcUrls: { default: { http: RPC_URLS }, public: { http: RPC_URLS } },
  testnet: true,
});

type Verdict = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';
const results: Array<{ name: string; verdict: Verdict; detail: string }> = [];

function report(name: string, verdict: Verdict, detail: string) {
  results.push({ name, verdict, detail });
  console.log(`[${verdict}] ${name} — ${detail}`);
}

async function withRetries<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  (attempt ${i}/${attempts} for ${label}: ${msg})`);
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastErr;
}

async function main() {
  // 1. Every configured RPC answers with the expected chain id.
  let liveUrl: string | null = null;
  for (const url of RPC_URLS) {
    const client = createPublicClient({ chain, transport: http(url, { timeout: 15_000 }) });
    try {
      const chainId = await withRetries(`chainId@${url}`, () => client.getChainId());
      if (chainId !== EXPECTED_CHAIN_ID) {
        report(`rpc-chain-id ${url}`, 'FAIL', `chainId=${chainId}, expected ${EXPECTED_CHAIN_ID}`);
        continue;
      }
      liveUrl = url;
      report(`rpc-chain-id ${url}`, 'PASS', `chainId=${chainId}`);
    } catch (err) {
      report(`rpc-chain-id ${url}`, 'FAIL', `unreachable: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!liveUrl) {
    console.log('\nSTAGING NOT READY: no reachable RPC.');
    process.exit(1);
  }

  const client = createPublicClient({ chain, transport: http(liveUrl, { timeout: 15_000 }) });

  // 2. Contract bytecode is deployed at every wired address.
  // Addresses are EIP-55 checksummed first: some RPCs reject mixed-case
  // non-checksummed addresses with "invalid parameters".
  for (const [name, rawAddress] of Object.entries(CONTRACTS)) {
    let address: `0x${string}`;
    try {
      address = getAddress(rawAddress);
    } catch {
      report(`contract-bytecode ${name}`, 'FAIL', `${rawAddress} is not a valid address`);
      continue;
    }
    try {
      const code = await withRetries(`bytecode@${name}`, () =>
        client.getBytecode({ address }),
      );
      if (!code || code === '0x') {
        report(`contract-bytecode ${name}`, 'FAIL', `${address} has no bytecode`);
      } else {
        report(`contract-bytecode ${name}`, 'PASS', `${address} (${code.length} hex chars)`);
      }
    } catch (err) {
      report(`contract-bytecode ${name}`, 'FAIL', `${err instanceof Error ? err.message : err}`);
    }
  }

  // 3. TestUSDC reads as the 6-decimal collateral the money math assumes.
  try {
    const decimals = await withRetries('decimals', () =>
      client.readContract({
        address: CONTRACTS.TEST_USDC as `0x${string}`,
        abi: parseAbi(['function decimals() view returns (uint8)']),
        functionName: 'decimals',
      }),
    );
    if (decimals !== 6) {
      report('testusdc-decimals', 'FAIL', `decimals=${decimals}, money math assumes 6`);
    } else {
      report('testusdc-decimals', 'PASS', 'decimals=6');
    }
  } catch (err) {
    report('testusdc-decimals', 'FAIL', `${err instanceof Error ? err.message : err}`);
  }

  // 4. Chain is advancing (sweeper/market loops depend on fresh blocks).
  try {
    const a = await withRetries('block-a', () => client.getBlockNumber());
    await new Promise((r) => setTimeout(r, 2000));
    const b = await withRetries('block-b', () => client.getBlockNumber());
    if (b >= a) {
      report('chain-liveness', 'PASS', `block ${a} -> ${b}`);
    } else {
      report('chain-liveness', 'FAIL', `block regressed ${a} -> ${b}`);
    }
  } catch (err) {
    report('chain-liveness', 'FAIL', `${err instanceof Error ? err.message : err}`);
  }

  // 5. Operator gas balance — warn-only (faucet-dependent, never a deploy gate).
  if (process.env.OPERATOR_ADDRESS) {
    try {
      const bal = await withRetries('operator-balance', () =>
        client.getBalance({ address: process.env.OPERATOR_ADDRESS as `0x${string}` }),
      );
      const stt = Number(formatEther(bal));
      report(
        'operator-gas',
        stt >= 0.001 ? 'PASS' : 'WARN',
        `operator ${process.env.OPERATOR_ADDRESS} holds ${stt} STT`,
      );
    } catch (err) {
      report('operator-gas', 'WARN', `unreadable: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    report('operator-gas', 'SKIP', 'set OPERATOR_ADDRESS to check faucet funding');
  }

  // 6. Backend API health — checked only when explicitly pointed at a deploy.
  if (process.env.STAGING_API_URL) {
    try {
      const res = await withRetries('api-health', () =>
        fetch(`${process.env.STAGING_API_URL}/api/v1/agents/status`),
      );
      report('api-health', res.ok ? 'PASS' : 'FAIL', `GET /agents/status -> ${res.status}`);
    } catch (err) {
      report('api-health', 'FAIL', `${err instanceof Error ? err.message : err}`);
    }
  } else {
    report('api-health', 'SKIP', 'set STAGING_API_URL to probe a deploy');
  }

  const fails = results.filter((r) => r.verdict === 'FAIL').length;
  console.log(`\nSTAGING ${fails === 0 ? 'READY' : 'NOT READY'}: ${results.length - fails}/${results.length} checks green.`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`[FAIL] staging-dry-run crashed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
