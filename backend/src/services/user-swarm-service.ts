import { isAddress, getAddress, type Address } from 'viem';
import { supabase } from '../config/supabase.js';
import type { AgentType } from '../types/index.js';

export type SwarmMode = 'COPY' | 'PERSONAL';

export interface PersonalSwarmConfig {
  userAddress: Address;
  mode: SwarmMode;
  copyTradeEnabled: boolean;
  voltEnabled: boolean;
  oracleEnabled: boolean;
  titanEnabled: boolean;
  sweeperEnabled: boolean;
  voltConfig: { driftThreshold: number; minEdge: number; lotSize: number; maxTradeSize?: number };
  oracleConfig: { minEdge: number; lotSize: number; maxTradeSize: number };
  titanConfig: { targetSpread: number; inventoryAversion: number; lotSize: number };
  customizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_VOLT_CONFIG = { driftThreshold: 0.002, minEdge: 0.03, lotSize: 5.0, maxTradeSize: 20.0 };
export const DEFAULT_ORACLE_CONFIG = { minEdge: 0.035, lotSize: 5.0, maxTradeSize: 20.0 };
export const DEFAULT_TITAN_CONFIG = { targetSpread: 0.04, inventoryAversion: 0.015, lotSize: 2.0 };

function isPersistenceEnabled(): boolean {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return false;
  const url = process.env.SUPABASE_URL || '';
  return url.length > 0 && !url.includes('mock-project');
}

function buildDefaultConfig(userAddress: Address): PersonalSwarmConfig {
  const now = new Date().toISOString();
  return {
    userAddress,
    mode: 'COPY',
    copyTradeEnabled: false,
    voltEnabled: true,
    oracleEnabled: true,
    titanEnabled: true,
    sweeperEnabled: true,
    voltConfig: { ...DEFAULT_VOLT_CONFIG },
    oracleConfig: { ...DEFAULT_ORACLE_CONFIG },
    titanConfig: { ...DEFAULT_TITAN_CONFIG },
    createdAt: now,
    updatedAt: now,
  };
}

function toRecord(row: any): PersonalSwarmConfig {
  return {
    userAddress: getAddress(row.user_address) as Address,
    mode: (row.mode as SwarmMode) || 'COPY',
    copyTradeEnabled: row.copy_trade_enabled === true,
    voltEnabled: row.volt_enabled ?? true,
    oracleEnabled: row.oracle_enabled ?? true,
    titanEnabled: row.titan_enabled ?? true,
    sweeperEnabled: row.sweeper_enabled ?? true,
    voltConfig: row.volt_config || { ...DEFAULT_VOLT_CONFIG },
    oracleConfig: row.oracle_config || { ...DEFAULT_ORACLE_CONFIG },
    titanConfig: row.titan_config || { ...DEFAULT_TITAN_CONFIG },
    customizedAt: row.customized_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserSwarmService {
  private cache = new Map<string, PersonalSwarmConfig>();

  constructor() {
    this.loadFromDb().catch(() => {});
  }

  private async loadFromDb(): Promise<void> {
    if (!isPersistenceEnabled()) return;
    try {
      const { data, error } = await supabase.from('user_swarm_configs').select('*').limit(500);
      if (error || !data) return;
      for (const row of data) {
        const rec = toRecord(row);
        this.cache.set(rec.userAddress.toLowerCase(), rec);
      }
    } catch {}
  }

  private normalizeAddress(addr: string): Address {
    if (!addr || !isAddress(addr)) throw new Error(`Invalid address: ${addr}`);
    return getAddress(addr) as Address;
  }

  public getConfig(userAddress: string): PersonalSwarmConfig {
    const normalized = this.normalizeAddress(userAddress);
    const key = normalized.toLowerCase();
    const existing = this.cache.get(key);
    if (existing) return { ...existing, voltConfig: { ...existing.voltConfig }, oracleConfig: { ...existing.oracleConfig }, titanConfig: { ...existing.titanConfig } };
    const def = buildDefaultConfig(normalized);
    this.cache.set(key, def);
    // async persist default lazily
    if (isPersistenceEnabled()) {
      void this.persistConfig(def);
    }
    return { ...def };
  }

  public getAllPersonalConfigs(): PersonalSwarmConfig[] {
    return Array.from(this.cache.values()).filter((c) => c.mode === 'PERSONAL' && c.copyTradeEnabled);
  }

  public isCopyTradeEnabled(userAddress: string): boolean {
    try {
      const cfg = this.getConfig(userAddress);
      return cfg.copyTradeEnabled === true;
    } catch {
      return false;
    }
  }

  public isCopyMode(userAddress: string): boolean {
    try {
      const cfg = this.getConfig(userAddress);
      return cfg.mode === 'COPY' && cfg.copyTradeEnabled === true;
    } catch {
      return false;
    }
  }

  public async upsertConfig(
    userAddress: string,
    updates: Partial<{
      mode: SwarmMode;
      copyTradeEnabled: boolean;
      voltEnabled: boolean;
      oracleEnabled: boolean;
      titanEnabled: boolean;
      sweeperEnabled: boolean;
      voltConfig: Partial<PersonalSwarmConfig['voltConfig']>;
      oracleConfig: Partial<PersonalSwarmConfig['oracleConfig']>;
      titanConfig: Partial<PersonalSwarmConfig['titanConfig']>;
    }>,
  ): Promise<PersonalSwarmConfig> {
    const normalized = this.normalizeAddress(userAddress);
    const key = normalized.toLowerCase();
    const current = this.getConfig(userAddress);
    const now = new Date().toISOString();

    let next: PersonalSwarmConfig = {
      ...current,
      voltConfig: { ...current.voltConfig },
      oracleConfig: { ...current.oracleConfig },
      titanConfig: { ...current.titanConfig },
      updatedAt: now,
    };

    if (typeof updates.copyTradeEnabled === 'boolean') {
      next.copyTradeEnabled = updates.copyTradeEnabled;
    }

    if (updates.mode) {
      if (updates.mode !== 'COPY' && updates.mode !== 'PERSONAL') throw new Error('Invalid mode');
      next.mode = updates.mode;
    }
    if (typeof updates.voltEnabled === 'boolean') next.voltEnabled = updates.voltEnabled;
    if (typeof updates.oracleEnabled === 'boolean') next.oracleEnabled = updates.oracleEnabled;
    if (typeof updates.titanEnabled === 'boolean') next.titanEnabled = updates.titanEnabled;
    if (typeof updates.sweeperEnabled === 'boolean') next.sweeperEnabled = updates.sweeperEnabled;

    if (updates.voltConfig) {
      if (updates.voltConfig.driftThreshold !== undefined) {
        const v = Number(updates.voltConfig.driftThreshold);
        if (isNaN(v) || v < 0.0001 || v > 0.02) throw new Error('Invalid driftThreshold (0.0001-0.02)');
        next.voltConfig.driftThreshold = v;
      }
      if (updates.voltConfig.minEdge !== undefined) {
        const v = Number(updates.voltConfig.minEdge);
        if (isNaN(v) || v < 0.005 || v > 0.2) throw new Error('Invalid volt minEdge (0.005-0.2)');
        next.voltConfig.minEdge = v;
      }
      if (updates.voltConfig.lotSize !== undefined) {
        const v = Number(updates.voltConfig.lotSize);
        if (isNaN(v) || v < 1 || v > 50) throw new Error('Invalid volt lotSize (1-50)');
        next.voltConfig.lotSize = Math.floor(v);
      }
      if (updates.voltConfig.maxTradeSize !== undefined) {
        const v = Number(updates.voltConfig.maxTradeSize);
        if (!isNaN(v) && v >= 1 && v <= 100) next.voltConfig.maxTradeSize = v;
      }
      next.mode = 'PERSONAL';
      next.customizedAt = now;
    }
    if (updates.oracleConfig) {
      if (updates.oracleConfig.minEdge !== undefined) {
        const v = Number(updates.oracleConfig.minEdge);
        if (isNaN(v) || v < 0.005 || v > 0.2) throw new Error('Invalid oracle minEdge');
        next.oracleConfig.minEdge = v;
      }
      if (updates.oracleConfig.lotSize !== undefined) {
        const v = Number(updates.oracleConfig.lotSize);
        if (isNaN(v) || v < 1 || v > 50) throw new Error('Invalid oracle lotSize');
        next.oracleConfig.lotSize = Math.floor(v);
      }
      if (updates.oracleConfig.maxTradeSize !== undefined) {
        const v = Number(updates.oracleConfig.maxTradeSize);
        if (!isNaN(v) && v >= 1 && v <= 100) next.oracleConfig.maxTradeSize = v;
      }
      next.mode = 'PERSONAL';
      next.customizedAt = now;
    }
    if (updates.titanConfig) {
      if (updates.titanConfig.targetSpread !== undefined) {
        const v = Number(updates.titanConfig.targetSpread);
        if (isNaN(v) || v < 0.01 || v > 0.15) throw new Error('Invalid targetSpread');
        next.titanConfig.targetSpread = v;
      }
      if (updates.titanConfig.inventoryAversion !== undefined) {
        const v = Number(updates.titanConfig.inventoryAversion);
        if (isNaN(v) || v < 0.001 || v > 0.1) throw new Error('Invalid inventoryAversion');
        next.titanConfig.inventoryAversion = v;
      }
      if (updates.titanConfig.lotSize !== undefined) {
        const v = Number(updates.titanConfig.lotSize);
        if (isNaN(v) || v < 1 || v > 50) throw new Error('Invalid titan lotSize');
        next.titanConfig.lotSize = Math.floor(v);
      }
      next.mode = 'PERSONAL';
      next.customizedAt = now;
    }

    // If explicitly toggling enabled flags and currently COPY, switching toggle implies PERSONAL
    if (updates.voltEnabled !== undefined || updates.oracleEnabled !== undefined || updates.titanEnabled !== undefined) {
      if (next.mode === 'COPY' && (updates.voltEnabled !== undefined || updates.oracleEnabled !== undefined || updates.titanEnabled !== undefined)) {
        // toggling while copy doesn't auto-personalize; keep COPY but record toggles for personal mode preview
        // However if user disables an agent, that implies personalization
        // We'll keep COPY unless they explicitly set PERSONAL via mode
      }
    }

    if (updates.mode === 'PERSONAL' && !next.customizedAt) {
      next.customizedAt = now;
    }

    this.cache.set(key, next);
    await this.persistConfig(next);
    return { ...next };
  }

  public async setMode(userAddress: string, mode: SwarmMode): Promise<PersonalSwarmConfig> {
    return this.upsertConfig(userAddress, { mode });
  }

  public async setCopyTradeEnabled(userAddress: string, enabled: boolean): Promise<PersonalSwarmConfig> {
    return this.upsertConfig(userAddress, { copyTradeEnabled: enabled });
  }

  public async toggleAgent(userAddress: string, agentType: AgentType, enabled: boolean): Promise<PersonalSwarmConfig> {
    const key = agentType.toLowerCase();
    if (key === 'volt') return this.upsertConfig(userAddress, { voltEnabled: enabled, mode: enabled !== this.getConfig(userAddress).voltEnabled ? 'PERSONAL' as SwarmMode : undefined });
    if (key === 'oracle') return this.upsertConfig(userAddress, { oracleEnabled: enabled });
    if (key === 'titan') return this.upsertConfig(userAddress, { titanEnabled: enabled });
    if (key === 'sweeper') return this.upsertConfig(userAddress, { sweeperEnabled: enabled });
    throw new Error(`Unknown agentType: ${agentType}`);
  }

  public async updateAgentConfig(userAddress: string, agentType: AgentType, config: Record<string, any>): Promise<PersonalSwarmConfig> {
    const normalizedAgent = agentType.toLowerCase();
    if (normalizedAgent === 'volt') return this.upsertConfig(userAddress, { voltConfig: config });
    if (normalizedAgent === 'oracle') return this.upsertConfig(userAddress, { oracleConfig: config });
    if (normalizedAgent === 'titan') return this.upsertConfig(userAddress, { titanConfig: config });
    throw new Error(`Unknown agentType for config: ${agentType}`);
  }

  public async resetToCopy(userAddress: string): Promise<PersonalSwarmConfig> {
    const normalized = this.normalizeAddress(userAddress);
    const key = normalized.toLowerCase();
    const current = this.getConfig(userAddress);
    const now = new Date().toISOString();
    const next: PersonalSwarmConfig = {
      ...current,
      mode: 'COPY',
      updatedAt: now,
    };
    this.cache.set(key, next);
    await this.persistConfig(next);
    return { ...next };
  }

  private async persistConfig(cfg: PersonalSwarmConfig): Promise<void> {
    if (!isPersistenceEnabled()) return;
    try {
      const payload = {
        user_address: cfg.userAddress,
        mode: cfg.mode,
        copy_trade_enabled: cfg.copyTradeEnabled,
        volt_enabled: cfg.voltEnabled,
        oracle_enabled: cfg.oracleEnabled,
        titan_enabled: cfg.titanEnabled,
        sweeper_enabled: cfg.sweeperEnabled,
        volt_config: cfg.voltConfig,
        oracle_config: cfg.oracleConfig,
        titan_config: cfg.titanConfig,
        customized_at: cfg.customizedAt || null,
        updated_at: cfg.updatedAt,
      };
      const { error } = await supabase.from('user_swarm_configs').upsert(payload as any, { onConflict: 'user_address' });
      if (error) {
        console.warn('[UserSwarmService] persist warning:', error.message);
      }
    } catch (err: any) {
      console.warn('[UserSwarmService] persist error:', err.message);
    }
  }
}

export const userSwarmService = new UserSwarmService();
