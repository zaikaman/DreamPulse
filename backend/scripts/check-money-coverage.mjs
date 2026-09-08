/**
 * Money-path coverage gate. Vitest only supports global thresholds, so this
 * script enforces per-file statement floors on the modules where user funds
 * are enforced, moved, or paid out. Reads the V8 report produced by
 * `npm run test:coverage` and exits 1 on any breach (CI fails the build).
 *
 * Usage: npm run coverage:gate --workspace=dreampulse-backend
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = join(root, 'coverage', 'coverage-final.json');

// Floor: file suffix -> minimum % statements. Calibrated 2026-09-08 against
// measured coverage minus a small buffer; raise (never lower) as tests grow.
const FLOORS = {
  'src/services/session-service.ts': 45,
  'src/services/settlement-service.ts': 45,
  'src/services/order-service.ts': 43,
  'src/services/session-key-crypto.ts': 65,
  'src/services/operator-approval-service.ts': 95,
  'src/services/auth-service.ts': 85,
  'src/middleware/wallet-auth.ts': 80,
  'src/websocket/market-emitter.ts': 95,
};

if (!existsSync(reportPath)) {
  console.error(`[coverage-gate] report missing: ${reportPath} (run test:coverage first)`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(reportPath, 'utf8'));
let breaches = 0;

console.log('[coverage-gate] money-path statement floors:');
for (const [suffix, floor] of Object.entries(FLOORS)) {
  const key = Object.keys(report).find((k) => k.endsWith(suffix.replaceAll('/', '\\')) || k.endsWith(suffix));
  if (!key) {
    console.log(`  MISSING  ${suffix} (no coverage data)`);
    breaches++;
    continue;
  }
  const { s, statementMap } = report[key];
  const total = Object.keys(s).length;
  const covered = Object.values(s).filter((c) => c > 0).length;
  void statementMap;
  const pct = total === 0 ? 100 : (covered / total) * 100;
  const ok = pct >= floor;
  if (!ok) breaches++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${suffix}: ${pct.toFixed(2)}% (floor ${floor}%)`);
}

if (breaches > 0) {
  console.error(`[coverage-gate] ${breaches} money-path floor(s) breached.`);
  process.exit(1);
}
console.log('[coverage-gate] all money-path floors hold.');
