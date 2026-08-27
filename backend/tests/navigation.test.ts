import { describe, it, expect } from 'vitest';

type DashboardViewType =
  | 'Landing'
  | 'Overview'
  | 'Edge Radar'
  | 'Markets'
  | 'Markets & Depth'
  | 'Trade Terminal'
  | 'AI Swarm Feed'
  | 'Swarm Cockpit'
  | 'Strategy Studio'
  | 'Backtester'
  | 'Analytics'
  | 'Settlement';

const VIEW_TO_HASH_MAP: Record<DashboardViewType, string> = {
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
  Analytics: 'analytics',
  Settlement: 'settlement',
};

function getHashForView(view: DashboardViewType): string {
  return VIEW_TO_HASH_MAP[view] ?? '';
}

function getViewForHash(rawHash: string): DashboardViewType {
  if (!rawHash) return 'Landing';

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

    case 'settlement':
    case 'sweeper':
    case 'settle':
    case 'claims':
    case 'claim':
    case 'payouts':
      return 'Settlement';

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

describe('Sidebar Page URLs & Router Hash Mapping Suite', () => {
  describe('Canonical View to URL Hash Mapping', () => {
    it('should map each of the 10 sidebar pages to its own dedicated canonical URL hash', () => {
      expect(getHashForView('Overview')).toBe('overview');
      expect(getHashForView('Edge Radar')).toBe('radar');
      expect(getHashForView('Markets')).toBe('markets');
      expect(getHashForView('Markets & Depth')).toBe('markets');
      expect(getHashForView('Trade Terminal')).toBe('trade');
      expect(getHashForView('AI Swarm Feed')).toBe('swarm');
      expect(getHashForView('Swarm Cockpit')).toBe('cockpit');
      expect(getHashForView('Strategy Studio')).toBe('studio');
      expect(getHashForView('Backtester')).toBe('backtest');
      expect(getHashForView('Settlement')).toBe('settlement');
      expect(getHashForView('Analytics')).toBe('analytics');
      expect(getHashForView('Landing')).toBe('');
    });
  });

  describe('URL Hash to View Resolution & Deep Linking', () => {
    it('should resolve canonical hashes with and without leading #', () => {
      expect(getViewForHash('#overview')).toBe('Overview');
      expect(getViewForHash('overview')).toBe('Overview');
      expect(getViewForHash('#radar')).toBe('Edge Radar');
      expect(getViewForHash('radar')).toBe('Edge Radar');
      expect(getViewForHash('#markets')).toBe('Markets');
      expect(getViewForHash('markets')).toBe('Markets');
      expect(getViewForHash('#trade')).toBe('Trade Terminal');
      expect(getViewForHash('trade')).toBe('Trade Terminal');
      expect(getViewForHash('#swarm')).toBe('AI Swarm Feed');
      expect(getViewForHash('swarm')).toBe('AI Swarm Feed');
      expect(getViewForHash('#cockpit')).toBe('Swarm Cockpit');
      expect(getViewForHash('cockpit')).toBe('Swarm Cockpit');
      expect(getViewForHash('#studio')).toBe('Strategy Studio');
      expect(getViewForHash('studio')).toBe('Strategy Studio');
      expect(getViewForHash('#backtest')).toBe('Backtester');
      expect(getViewForHash('backtest')).toBe('Backtester');
      expect(getViewForHash('#settlement')).toBe('Settlement');
      expect(getViewForHash('settlement')).toBe('Settlement');
      expect(getViewForHash('#analytics')).toBe('Analytics');
      expect(getViewForHash('analytics')).toBe('Analytics');
      expect(getViewForHash('#landing')).toBe('Landing');
      expect(getViewForHash('')).toBe('Landing');
    });

    it('should support deep link aliases and legacy routes', () => {
      expect(getViewForHash('#terminal')).toBe('Trade Terminal');
      expect(getViewForHash('#trading')).toBe('Trade Terminal');
      expect(getViewForHash('#trade-terminal')).toBe('Trade Terminal');
      expect(getViewForHash('#depth')).toBe('Markets');
      expect(getViewForHash('#explorer')).toBe('Markets');
      expect(getViewForHash('#catalog')).toBe('Markets');
      expect(getViewForHash('#ai')).toBe('AI Swarm Feed');
      expect(getViewForHash('#feed')).toBe('AI Swarm Feed');
      expect(getViewForHash('#reasoning')).toBe('AI Swarm Feed');
      expect(getViewForHash('#bot')).toBe('Swarm Cockpit');
      expect(getViewForHash('#guardrails')).toBe('Swarm Cockpit');
      expect(getViewForHash('#builder')).toBe('Strategy Studio');
      expect(getViewForHash('#backtester')).toBe('Backtester');
      expect(getViewForHash('#simulation')).toBe('Backtester');
      expect(getViewForHash('#sweeper')).toBe('Settlement');
      expect(getViewForHash('#claims')).toBe('Settlement');
      expect(getViewForHash('#portfolio')).toBe('Analytics');
      expect(getViewForHash('#pnl')).toBe('Analytics');
    });

    it('should handle case insensitivity and query parameters gracefully', () => {
      expect(getViewForHash('#TRADE?market=BTC-5M')).toBe('Trade Terminal');
      expect(getViewForHash('#MARKETS?category=crypto')).toBe('Markets');
      expect(getViewForHash('#Studio/draft-1')).toBe('Strategy Studio');
      expect(getViewForHash('###radar')).toBe('Edge Radar');
    });

    it('should fallback to Landing for empty or unknown hashes', () => {
      expect(getViewForHash('')).toBe('Landing');
      expect(getViewForHash('#unknown-path-xyz')).toBe('Landing');
    });
  });
});
