import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { OrderService } from '../src/services/order-service.js';
import { marketService } from '../src/services/market-service.js';
import { publicClient } from '../src/config/somnia.js';

// --- Controllable Supabase mock: SELECTs park at an armed gate, writes resolve ---
// `var` (not `let`): the mock factory runs before this module body evaluates,
// so TDZ-sensitive bindings break import-time singleton constructors.
//@noreorder
var selectGateArmed = false;
var releaseGate: ((v: unknown) => void) | null = null;
var gatePromise: Promise<unknown> | null = null;

function armSelectGate() {
  selectGateArmed = true;
  gatePromise = new Promise((resolve) => {
    releaseGate = resolve;
  });
}

function releaseSelectGate() {
  selectGateArmed = false;
  releaseGate?.({ data: [], error: null });
  releaseGate = null;
  gatePromise = null;
}

function makeBuilder(): any {
  const b: any = { _isWrite: false };
  for (const m of ['select', 'eq', 'neq', 'in', 'limit', 'order', 'range', 'single', 'maybeSingle']) {
    b[m] = (..._args: any[]) => b;
  }
  b.insert = (..._args: any[]) => {
    b._isWrite = true;
    return b;
  };
  b.update = (..._args: any[]) => {
    b._isWrite = true;
    return b;
  };
  b.upsert = (..._args: any[]) => {
    b._isWrite = true;
    return b;
  };
  b.delete = (..._args: any[]) => {
    b._isWrite = true;
    return b;
  };
  b.then = (resolve: any, reject: any) => {
    if (b._isWrite || !selectGateArmed || !gatePromise) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    }
    return gatePromise.then(() => ({ data: [], error: null })).then(resolve, reject);
  };
  return b;
}

function makeChannelStub(): any {
  const stub: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return undefined;
        return (..._args: any[]) => stub;
      },
    },
  );
  return stub;
}

vi.mock('../src/config/supabase.js', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/config/supabase.js')>();
  return {
    ...orig,
    supabase: {
      from: (_table: string) => makeBuilder(),
      channel: (_name: string) => makeChannelStub(),
      removeChannel: async () => {},
    },
    isPersistenceEnabled: () => true,
    isPersistenceConfigured: () => true,
  };
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Order replay race (concurrent double-submit, persistence on)', () => {
  const user = privateKeyToAccount(generatePrivateKey()).address;
  const RACE_HASH = `0x${'c3'.repeat(32)}`;

  beforeEach(() => {
    selectGateArmed = false;
    releaseGate = null;
    gatePromise = null;
    // Chain verification short-circuits via the NODE_ENV=test fallback (no network)
    vi.spyOn(publicClient, 'getTransactionReceipt').mockRejectedValue(new Error('offline'));
    // Market persistence touches live RPC — stub it out (persistence _flow_ is what we test)
    vi.spyOn(marketService, 'ensureMarketPersisted').mockResolvedValue(undefined as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executes exactly one of two concurrent submits with the same txHash', async () => {
    const service = new OrderService();
    await flush(); // let constructor DB warmup settle against the immediate-empty mock
    armSelectGate();

    const params = {
      userAddress: user,
      marketId: 'm-race-1',
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.5,
      lotSize: 10,
      txHash: RACE_HASH,
    } as any;

    const p1 = service.submitUserOrder(params);
    const p2 = service.submitUserOrder({ ...params });
    // Attach handlers immediately: p2 rejects synchronously at the in-flight
    // lock, and an unobserved rejection trips Vitest's unhandled-error guard.
    void p1.catch(() => {});
    void p2.catch(() => {});
    await flush();
    await flush(); // the winning submission must be parked inside the async replay check
    releaseSelectGate();

    const [r1, r2] = await Promise.allSettled([p1, p2]);
    const fulfilled = [r1, r2].filter((r) => r.status === 'fulfilled');
    const rejected = [r1, r2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.message).toMatch(/Replay detected/);

    const dupes = service
      .getOrders()
      .filter((o: any) => o.txHash && o.txHash.toLowerCase() === RACE_HASH.toLowerCase());
    expect(dupes).toHaveLength(1);
  });

  it('releases the in-flight lock after completion (no deadlock, cache replay intact)', async () => {
    const service = new OrderService();
    await flush();

    const params = {
      userAddress: user,
      marketId: 'm-race-2',
      outcome: 'YES',
      direction: 'BUY',
      orderType: 'LIMIT',
      price: 0.5,
      lotSize: 10,
      txHash: `0x${'d4'.repeat(32)}`,
    } as any;

    await service.submitUserOrder(params);
    // Same hash after completion must hit the settled-order replay check, not the lock
    await expect(service.submitUserOrder({ ...params })).rejects.toThrow(
      /already been submitted/,
    );
  });
});
