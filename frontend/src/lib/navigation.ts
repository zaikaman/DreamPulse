import type { DashboardViewType } from '../components/landing/CinematicHero.js';

/**
 * Canonical URL hash for each platform dashboard view.
 */
export const VIEW_TO_HASH_MAP: Record<DashboardViewType, string> = {
  Landing: '',
  Overview: 'overview',
  'Edge Radar': 'radar',
  Markets: 'markets',
  'Markets & Depth': 'markets',
  'Trade Terminal': 'trade',
  'AI Swarm Feed': 'swarm',
  'Swarm Cockpit': 'cockpit',
  'Strategy Studio': 'studio',
  Backtester: 'backtest',
  'Swarm Arena': 'arena',
  Analytics: 'analytics',
  Settlement: 'settlement',
  'Trader Profile': 'profile',
};

/**
 * Get the canonical URL hash string for a given view.
 * @param view The target dashboard view
 * @returns Hash string without the leading '#' (e.g. 'trade', 'markets', 'overview')
 */
export function getHashForView(view: DashboardViewType): string {
  return VIEW_TO_HASH_MAP[view] ?? '';
}

/**
 * Parse an incoming URL hash (or route string) and return the corresponding DashboardViewType.
 * Supports canonical names as well as helpful aliases and deep links.
 * @param rawHash The raw location.hash or path string
 * @returns Resolved DashboardViewType
 */
export function getViewForHash(rawHash: string): DashboardViewType {
  if (!rawHash) return 'Landing';

  // Normalize: strip leading '#', query params, trailing slashes, convert to lowercase
  const hash = rawHash
    .replace(/^#+/, '')
    .split('?')[0]
    .split('/')[0]
    .toLowerCase()
    .trim();

  switch (hash) {
    case 'overview':
    case 'dashboard':
    case 'main':
    case 'home-dashboard':
      return 'Overview';

    case 'radar':
    case 'edgeradar':
    case 'edge-radar':
    case 'mispricing':
    case 'heatmap':
      return 'Edge Radar';

    case 'markets':
    case 'market':
    case 'depth':
    case 'catalog':
    case 'explorer':
    case 'markets-depth':
      return 'Markets';

    case 'trade':
    case 'terminal':
    case 'trading':
    case 'trade-terminal':
    case 'cockpit-terminal':
    case 'clob':
      return 'Trade Terminal';

    case 'swarm':
    case 'ai':
    case 'feed':
    case 'swarm-feed':
    case 'reasoning':
    case 'cot':
    case 'agents':
      return 'AI Swarm Feed';

    case 'cockpit':
    case 'swarm-cockpit':
    case 'bot':
    case 'my-bot':
    case 'guardrails':
    case 'risk':
      return 'Swarm Cockpit';

    case 'studio':
    case 'strategy-studio':
    case 'builder':
    case 'custom-agent':
    case 'nocode':
      return 'Strategy Studio';

    case 'backtest':
    case 'backtester':
    case 'simulation':
    case 'quant-lab':
    case 'lab':
    case 'replay':
      return 'Backtester';

    case 'arena':
    case 'swarm-arena':
    case 'leaderboard':
    case 'social':
    case 'rankings':
    case 'forecasters':
      return 'Swarm Arena';

    case 'settlement':
    case 'sweeper':
    case 'settle':
    case 'claims':
    case 'claim':
    case 'payouts':
      return 'Settlement';

    case 'profile':
    case 'trader':
    case 'trader-profile':
    case 'forecaster':
    case 'user':
      return 'Trader Profile';

    case 'analytics':
    case 'portfolio':
    case 'pnl':
    case 'performance':
    case 'ledger':
    case 'stats':
      return 'Analytics';

    case 'landing':
    case 'hero':
    case 'home':
    case '':
      return 'Landing';

    default:
      return 'Landing';
  }
}

/**
 * Extract target trader address from URL hash if present (e.g. #profile/0x123... or #trader?address=0x123...)
 */
export function getProfileAddressFromHash(rawHash: string): string | null {
  if (!rawHash) return null;
  const match = rawHash.match(/#(?:profile|trader|forecaster)\/([0-9a-zA-Z_]+)/i);
  if (match && match[1]) return match[1];
  const queryMatch = rawHash.match(/[?&]address=([0-9a-zA-Z_]+)/i);
  if (queryMatch && queryMatch[1]) return queryMatch[1];
  return null;
}

/**
 * Navigate to a specific view by updating the window.location.hash.
 * Avoids redundant hash replacements if already on that hash.
 * @param view The target dashboard view
 */
export function navigateToView(view: DashboardViewType): void {
  if (typeof window === 'undefined') return;

  const targetHash = getHashForView(view);
  const currentCleanHash = window.location.hash.replace(/^#+/, '').toLowerCase().trim();

  if (targetHash === '') {
    if (currentCleanHash !== '' && currentCleanHash !== 'landing') {
      window.location.hash = '';
    }
  } else if (currentCleanHash !== targetHash) {
    window.location.hash = `#${targetHash}`;
  }
}
