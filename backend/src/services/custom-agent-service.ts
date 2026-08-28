import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { generateStrategyWithGemini } from '../llm/client.js';
import type {
  CustomAgentDefinition,
  CustomSwarmDefinition,
  CustomAgentRules,
  ConditionRule,
} from '../types/index.js';

// Pre-built Starter Templates for Immediate Playability (using deterministic valid UUIDs)
export const STARTER_TEMPLATES: CustomAgentDefinition[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    userAddress: '0x0000000000000000000000000000000000000000',
    name: 'RSI Oversold Dip Sniper',
    description: 'Executes rapid CALL orders when RSI (14) drops below 28 and spot touches the lower Bollinger Band.',
    symbol: 'BTC/USD',
    timeframe: '1m',
    strategyType: 'MEAN_REVERSION',
    color: '#2dd4bf',
    icon: 'BoltIcon',
    isActive: true,
    isDeployed: false,
    allocatedAllowance: 100,
    spentAllowance: 0,
    pnl: 0,
    winRate: 0,
    tradesCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    rules: {
      operator: 'AND',
      conditions: [
        {
          id: 'c-1',
          indicator: 'RSI',
          period: 14,
          operator: 'LESS_THAN',
          value: 28,
        },
        {
          id: 'c-2',
          indicator: 'BOLLINGER_LOWER',
          period: 20,
          stdDev: 2.0,
          operator: 'LESS_THAN',
          value: 0,
        },
      ],
      action: {
        direction: 'CALL',
        durationSec: 60,
        stakeType: 'FIXED',
        stakeAmount: 10,
      },
      risk: {
        maxConsecutiveLosses: 2,
        cooldownMinutes: 3,
        minPoolPayoutPct: 78,
      },
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    userAddress: '0x0000000000000000000000000000000000000000',
    name: 'Bollinger Band Exhaustion Fade',
    description: 'Fades overextended spikes at the upper Bollinger ceiling with short-duration PUT contracts.',
    symbol: 'ETH/USD',
    timeframe: '5m',
    strategyType: 'MEAN_REVERSION',
    color: '#f59e0b',
    icon: 'AdjustmentsHorizontalIcon',
    isActive: true,
    isDeployed: false,
    allocatedAllowance: 150,
    spentAllowance: 0,
    pnl: 0,
    winRate: 0,
    tradesCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    rules: {
      operator: 'AND',
      conditions: [
        {
          id: 'c-1',
          indicator: 'BOLLINGER_UPPER',
          period: 20,
          stdDev: 2.2,
          operator: 'GREATER_THAN',
          value: 0,
        },
        {
          id: 'c-2',
          indicator: 'RSI',
          period: 14,
          operator: 'GREATER_THAN',
          value: 72,
        },
      ],
      action: {
        direction: 'PUT',
        durationSec: 300,
        stakeType: 'FIXED',
        stakeAmount: 15,
      },
      risk: {
        maxConsecutiveLosses: 3,
        cooldownMinutes: 5,
        minPoolPayoutPct: 75,
      },
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    userAddress: '0x0000000000000000000000000000000000000000',
    name: 'Fast EMA Momentum Rider',
    description: 'Surfs trend velocity on 9/21 EMA golden crosses during expanding directional volume.',
    symbol: 'SOL/USD',
    timeframe: '5m',
    strategyType: 'MOMENTUM',
    color: '#a78bfa',
    icon: 'SparklesIcon',
    isActive: true,
    isDeployed: false,
    allocatedAllowance: 200,
    spentAllowance: 0,
    pnl: 0,
    winRate: 0,
    tradesCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    rules: {
      operator: 'AND',
      conditions: [
        {
          id: 'c-1',
          indicator: 'EMA',
          period: 9,
          secondaryPeriod: 21,
          operator: 'CROSS_ABOVE',
          value: 0,
        },
        {
          id: 'c-2',
          indicator: 'PRICE_DRIFT',
          period: 5,
          operator: 'GREATER_THAN',
          value: 0.0015,
        },
      ],
      action: {
        direction: 'CALL',
        durationSec: 300,
        stakeType: 'FIXED',
        stakeAmount: 20,
      },
      risk: {
        maxConsecutiveLosses: 2,
        cooldownMinutes: 4,
        minPoolPayoutPct: 80,
      },
    },
  },
];

export const STARTER_TEMPLATE_IDS = STARTER_TEMPLATES.map((t) => t.id);

export class CustomAgentService {
  private inMemoryAgents: Map<string, CustomAgentDefinition> = new Map();
  private inMemorySwarms: Map<string, CustomSwarmDefinition> = new Map();

  constructor() {
    for (const t of STARTER_TEMPLATES) {
      this.inMemoryAgents.set(t.id, JSON.parse(JSON.stringify(t)));
    }
    void this.seedStarterTemplates();
  }

  private async seedStarterTemplates(): Promise<void> {
    try {
      for (const t of STARTER_TEMPLATES) {
        await supabase.from('custom_agents').upsert(
          {
            id: t.id,
            user_address: t.userAddress,
            name: t.name,
            description: t.description,
            symbol: t.symbol,
            timeframe: t.timeframe,
            strategy_type: t.strategyType,
            rules: t.rules,
            color: t.color,
            icon: t.icon,
            is_active: t.isActive,
            is_deployed: t.isDeployed,
            allocated_allowance: t.allocatedAllowance,
            spent_allowance: t.spentAllowance,
            pnl: t.pnl ?? 0,
            win_rate: t.winRate ?? 0,
            trades_count: t.tradesCount ?? 0,
            created_at: t.createdAt,
            updated_at: t.createdAt,
          },
          { onConflict: 'id', ignoreDuplicates: true }
        );
      }
    } catch (err: any) {
      console.warn('[CustomAgentService] Could not auto-seed starter templates:', err.message);
    }
  }

  public mapDbRowToAgent(row: any, defaultTemplate?: CustomAgentDefinition): CustomAgentDefinition {
    return {
      id: row.id,
      userAddress: row.user_address,
      name: row.name,
      description: row.description || '',
      symbol: row.symbol,
      timeframe: row.timeframe,
      strategyType: row.strategy_type,
      rules: row.rules,
      color: row.color,
      icon: row.icon,
      isActive: row.is_active !== false,
      isDeployed: Boolean(row.is_deployed),
      allocatedAllowance:
        row.allocated_allowance !== undefined && row.allocated_allowance !== null
          ? Number(row.allocated_allowance)
          : (defaultTemplate?.allocatedAllowance ?? 100),
      spentAllowance:
        row.spent_allowance !== undefined && row.spent_allowance !== null
          ? Number(row.spent_allowance)
          : (defaultTemplate?.spentAllowance ?? 0),
      pnl:
        row.pnl !== undefined && row.pnl !== null
          ? Number(row.pnl)
          : (defaultTemplate?.pnl ?? 0),
      winRate:
        row.win_rate !== undefined && row.win_rate !== null
          ? Number(row.win_rate)
          : (defaultTemplate?.winRate ?? 0),
      tradesCount:
        row.trades_count !== undefined && row.trades_count !== null
          ? Number(row.trades_count)
          : (defaultTemplate?.tradesCount ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Retrieves all agents: Starter templates + user-specific created/deployed agents.
   * Ensures pristine templates are preserved and not polluted across wallets.
   */
  public async getCustomAgents(userAddress?: string): Promise<CustomAgentDefinition[]> {
    const cleanAddr = userAddress?.toLowerCase();
    const result: CustomAgentDefinition[] = [];
    const seenIds = new Set<string>();

    // 1. Fetch user-owned custom agents from DB
    if (cleanAddr) {
      try {
        const { data, error } = await supabase
          .from('custom_agents')
          .select('*')
          .eq('user_address', cleanAddr)
          .order('created_at', { ascending: false });

        if (!error && Array.isArray(data)) {
          for (const row of data) {
            const mapped = this.mapDbRowToAgent(row);
            result.push(mapped);
            seenIds.add(mapped.id);
            this.inMemoryAgents.set(mapped.id, mapped);
          }
        }
      } catch (_err) {
        // Fall back to memory
      }

      // Check memory for user-owned agents
      for (const [id, agent] of this.inMemoryAgents.entries()) {
        if (agent.userAddress.toLowerCase() === cleanAddr && !seenIds.has(id)) {
          result.push(agent);
          seenIds.add(id);
        }
      }
    }

    // 2. Always append pristine starter templates if not already in user's list
    for (const t of STARTER_TEMPLATES) {
      if (!seenIds.has(t.id)) {
        result.push(JSON.parse(JSON.stringify(t)));
        seenIds.add(t.id);
      }
    }

    return result;
  }

  /**
   * Retrieves all currently active and deployed custom agents across all users.
   */
  public async getActiveDeployedAgents(): Promise<CustomAgentDefinition[]> {
    const deployed: CustomAgentDefinition[] = [];
    const seenIds = new Set<string>();

    try {
      const { data, error } = await supabase
        .from('custom_agents')
        .select('*')
        .eq('is_deployed', true)
        .eq('is_active', true);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          if (row.user_address === '0x0000000000000000000000000000000000000000') continue;
          const mapped = this.mapDbRowToAgent(row);
          deployed.push(mapped);
          seenIds.add(mapped.id);
          this.inMemoryAgents.set(mapped.id, mapped);
        }
      }
    } catch (err: any) {
      console.warn('[CustomAgentService] Error loading active deployed agents:', err.message);
    }

    for (const agent of this.inMemoryAgents.values()) {
      if (
        agent.isDeployed &&
        agent.isActive &&
        agent.userAddress !== '0x0000000000000000000000000000000000000000' &&
        !seenIds.has(agent.id)
      ) {
        deployed.push(agent);
        seenIds.add(agent.id);
      }
    }

    return deployed;
  }

  public async getCustomAgentById(id: string): Promise<CustomAgentDefinition | null> {
    // Check DB first for freshest persisted state
    try {
      const { data, error } = await supabase.from('custom_agents').select('*').eq('id', id).single();
      if (!error && data) {
        const mapped: CustomAgentDefinition = {
          id: data.id,
          userAddress: data.user_address,
          name: data.name,
          description: data.description || '',
          symbol: data.symbol,
          timeframe: data.timeframe,
          strategyType: data.strategy_type,
          rules: data.rules,
          color: data.color,
          icon: data.icon,
          isActive: data.is_active !== false,
          isDeployed: Boolean(data.is_deployed),
          allocatedAllowance:
            data.allocated_allowance !== undefined && data.allocated_allowance !== null
              ? Number(data.allocated_allowance)
              : 100,
          spentAllowance:
            data.spent_allowance !== undefined && data.spent_allowance !== null
              ? Number(data.spent_allowance)
              : 0,
          pnl:
            data.pnl !== undefined && data.pnl !== null
              ? Number(data.pnl)
              : (this.inMemoryAgents.get(data.id)?.pnl ?? 0),
          winRate:
            data.win_rate !== undefined && data.win_rate !== null
              ? Number(data.win_rate)
              : (this.inMemoryAgents.get(data.id)?.winRate ?? 0),
          tradesCount:
            data.trades_count !== undefined && data.trades_count !== null
              ? Number(data.trades_count)
              : (this.inMemoryAgents.get(data.id)?.tradesCount ?? 0),
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
        this.inMemoryAgents.set(id, mapped);
        return mapped;
      }
    } catch {
      // fallback
    }

    const inMem = this.inMemoryAgents.get(id);
    if (inMem) return inMem;

    const tpl = STARTER_TEMPLATES.find((t) => t.id === id);
    if (tpl) return { ...tpl };

    return null;
  }

  public async createCustomAgent(
    payload: Omit<CustomAgentDefinition, 'id' | 'createdAt'>
  ): Promise<CustomAgentDefinition> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const agent: CustomAgentDefinition = {
      id,
      userAddress: payload.userAddress.toLowerCase(),
      name: payload.name.trim() || 'Custom Agent',
      description: payload.description || '',
      symbol: payload.symbol || 'BTC/USD',
      timeframe: payload.timeframe || '5m',
      strategyType: payload.strategyType || 'CUSTOM',
      rules: payload.rules,
      color: payload.color || '#2dd4bf',
      icon: payload.icon || 'BoltIcon',
      isActive: payload.isActive !== false,
      isDeployed: payload.isDeployed === true,
      allocatedAllowance: payload.allocatedAllowance ?? 100,
      spentAllowance: payload.spentAllowance ?? 0,
      pnl: payload.pnl ?? 0,
      winRate: payload.winRate ?? 0,
      tradesCount: payload.tradesCount ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    // Store in-memory
    this.inMemoryAgents.set(id, agent);

    // Persist to Supabase
    try {
      const { error } = await supabase.from('custom_agents').insert({
        id: agent.id,
        user_address: agent.userAddress,
        name: agent.name,
        description: agent.description,
        symbol: agent.symbol,
        timeframe: agent.timeframe,
        strategy_type: agent.strategyType,
        rules: agent.rules,
        color: agent.color,
        icon: agent.icon,
        is_active: agent.isActive,
        is_deployed: agent.isDeployed,
        allocated_allowance: agent.allocatedAllowance,
        spent_allowance: agent.spentAllowance,
        pnl: agent.pnl,
        win_rate: agent.winRate,
        trades_count: agent.tradesCount,
        created_at: agent.createdAt,
        updated_at: agent.updatedAt,
      });
      if (error) {
        console.error('[CustomAgentService] DB insert error:', error);
      }
    } catch (err: any) {
      console.warn('[CustomAgentService] Could not persist agent to DB:', err.message);
    }

    return agent;
  }

  public async updateCustomAgent(
    id: string,
    updates: Partial<CustomAgentDefinition>
  ): Promise<CustomAgentDefinition | null> {
    const existing = await this.getCustomAgentById(id);
    if (!existing) return null;

    const updated: CustomAgentDefinition = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.inMemoryAgents.set(id, updated);

    try {
      const { error } = await supabase
        .from('custom_agents')
        .upsert({
          id: updated.id,
          user_address: updated.userAddress,
          name: updated.name,
          description: updated.description,
          symbol: updated.symbol,
          timeframe: updated.timeframe,
          strategy_type: updated.strategyType,
          rules: updated.rules,
          color: updated.color,
          icon: updated.icon,
          is_active: updated.isActive,
          is_deployed: updated.isDeployed,
          allocated_allowance: updated.allocatedAllowance,
          spent_allowance: updated.spentAllowance,
          pnl: updated.pnl ?? 0,
          win_rate: updated.winRate ?? 0,
          trades_count: updated.tradesCount ?? 0,
          updated_at: updated.updatedAt,
        });
      if (error) {
        console.error('[CustomAgentService] DB upsert error:', error);
      }
    } catch (err: any) {
      console.warn('[CustomAgentService] Could not update agent in DB:', err.message);
    }

    return updated;
  }

  public async deployAgent(
    id: string,
    userAddress: string,
    allowance?: number
  ): Promise<CustomAgentDefinition | null> {
    const cleanUser = userAddress.toLowerCase();
    const existing = await this.getCustomAgentById(id);
    if (!existing) return null;

    const isStarterTemplate =
      STARTER_TEMPLATE_IDS.includes(id) &&
      existing.userAddress === '0x0000000000000000000000000000000000000000';

    if (isStarterTemplate) {
      // Check if user already cloned this template
      const userAgents = await this.getCustomAgents(cleanUser);
      const alreadyCloned = userAgents.find(
        (a) => a.userAddress.toLowerCase() === cleanUser && a.name === existing.name && a.id !== id
      );
      if (alreadyCloned) {
        return this.updateCustomAgent(alreadyCloned.id, {
          isDeployed: true,
          isActive: true,
          ...(allowance !== undefined ? { allocatedAllowance: Math.max(0, allowance) } : {}),
        });
      }

      // Clone a dedicated custom agent instance for this user so the starter template remains pristine
      return this.createCustomAgent({
        userAddress: cleanUser,
        name: existing.name,
        description: existing.description,
        symbol: existing.symbol,
        timeframe: existing.timeframe,
        strategyType: existing.strategyType,
        rules: JSON.parse(JSON.stringify(existing.rules)),
        color: existing.color,
        icon: existing.icon,
        isActive: true,
        isDeployed: true,
        allocatedAllowance: allowance !== undefined ? Math.max(0, allowance) : (existing.allocatedAllowance ?? 100),
        spentAllowance: 0,
      });
    }

    const updates: Partial<CustomAgentDefinition> = {
      isDeployed: true,
      isActive: true,
      ...(existing.userAddress === '0x0000000000000000000000000000000000000000' && userAddress
        ? { userAddress: cleanUser }
        : {}),
      ...(allowance !== undefined ? { allocatedAllowance: Math.max(0, allowance) } : {}),
    };
    return this.updateCustomAgent(id, updates);
  }

  public async recordTradeFill(agentId: string, tradeCost: number): Promise<void> {
    const agent = await this.getCustomAgentById(agentId);
    if (!agent) return;

    const newSpent = Number(((agent.spentAllowance || 0) + tradeCost).toFixed(4));
    const newTradesCount = (agent.tradesCount || 0) + 1;

    agent.spentAllowance = newSpent;
    agent.tradesCount = newTradesCount;
    agent.updatedAt = new Date().toISOString();
    this.inMemoryAgents.set(agentId, agent);

    try {
      await supabase.from('custom_agents').update({
        spent_allowance: newSpent,
        trades_count: newTradesCount,
        updated_at: agent.updatedAt,
      }).eq('id', agentId);
    } catch (err: any) {
      console.warn(`[CustomAgentService] Failed to persist trade fill for agent ${agentId}:`, err.message);
    }
  }

  public async recordTradeSettlement(agentId: string, realizedPnl: number, isWin: boolean): Promise<void> {
    const agent = await this.getCustomAgentById(agentId);
    if (!agent) return;

    const newPnl = Number(((agent.pnl || 0) + realizedPnl).toFixed(2));
    const totalTrades = Math.max(1, agent.tradesCount || 1);
    const prevWins = Math.round(((agent.winRate || 0) / 100) * Math.max(0, totalTrades - 1));
    const newWins = prevWins + (isWin ? 1 : 0);
    const newWinRate = Number(((newWins / totalTrades) * 100).toFixed(1));

    agent.pnl = newPnl;
    agent.winRate = newWinRate;
    agent.updatedAt = new Date().toISOString();
    this.inMemoryAgents.set(agentId, agent);

    try {
      await supabase.from('custom_agents').update({
        pnl: newPnl,
        win_rate: newWinRate,
        updated_at: agent.updatedAt,
      }).eq('id', agentId);
    } catch (err: any) {
      console.warn(`[CustomAgentService] Failed to persist trade settlement for agent ${agentId}:`, err.message);
    }
  }

  public async findAgentForUserAndSymbol(userAddress: string, symbol: string): Promise<CustomAgentDefinition | null> {
    const cleanUser = userAddress.toLowerCase();
    const deployed = await this.getActiveDeployedAgents();
    const match = deployed.find(
      (a) => a.userAddress.toLowerCase() === cleanUser && a.symbol.toUpperCase() === symbol.toUpperCase()
    );
    return match || null;
  }

  public async pauseAgent(
    id: string,
    _userAddress: string
  ): Promise<CustomAgentDefinition | null> {
    const existing = await this.getCustomAgentById(id);
    if (!existing) return null;

    const updates: Partial<CustomAgentDefinition> = {
      isDeployed: false,
    };
    return this.updateCustomAgent(id, updates);
  }

  public async setAgentAllowance(
    id: string,
    _userAddress: string,
    allowance: number
  ): Promise<CustomAgentDefinition | null> {
    const existing = await this.getCustomAgentById(id);
    if (!existing) return null;

    const updates: Partial<CustomAgentDefinition> = {
      allocatedAllowance: Math.max(0, allowance),
    };
    return this.updateCustomAgent(id, updates);
  }

  public async deleteCustomAgent(id: string, userAddress: string): Promise<boolean> {
    this.inMemoryAgents.delete(id);
    try {
      const { error } = await supabase
        .from('custom_agents')
        .delete()
        .eq('id', id);
      if (error) {
        console.error('[CustomAgentService] DB delete error:', error);
      }
      return !error;
    } catch {
      return true;
    }
  }

  // ----------------------------------------------------------------------------
  // Custom Swarms
  // ----------------------------------------------------------------------------
  public async getCustomSwarms(userAddress?: string): Promise<CustomSwarmDefinition[]> {
    const list: CustomSwarmDefinition[] = [];

    try {
      let query = supabase.from('custom_swarms').select('*').order('created_at', { ascending: false });
      if (userAddress) {
        query = query.eq('user_address', userAddress.toLowerCase());
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        for (const row of data) {
          list.push({
            id: row.id,
            userAddress: row.user_address,
            name: row.name,
            description: row.description || '',
            agents: Array.isArray(row.agent_ids) ? row.agent_ids : [],
            consensusRule: row.consensus_rule,
            confidenceThreshold: Number(row.confidence_threshold) || 0.6,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        }
      }
    } catch {
      // ignore
    }

    for (const [id, swarm] of this.inMemorySwarms.entries()) {
      if (!list.some((s) => s.id === id)) {
        if (!userAddress || swarm.userAddress.toLowerCase() === userAddress.toLowerCase()) {
          list.push(swarm);
        }
      }
    }

    return list;
  }

  public async createCustomSwarm(
    payload: Omit<CustomSwarmDefinition, 'id' | 'createdAt'>
  ): Promise<CustomSwarmDefinition> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const swarm: CustomSwarmDefinition = {
      id,
      userAddress: payload.userAddress.toLowerCase(),
      name: payload.name.trim() || 'Custom Swarm',
      description: payload.description || '',
      agents: payload.agents || [],
      consensusRule: payload.consensusRule || 'MAJORITY',
      confidenceThreshold: payload.confidenceThreshold ?? 0.6,
      isActive: payload.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };

    this.inMemorySwarms.set(id, swarm);

    try {
      await supabase.from('custom_swarms').insert({
        id: swarm.id,
        user_address: swarm.userAddress,
        name: swarm.name,
        description: swarm.description,
        agent_ids: swarm.agents,
        consensus_rule: swarm.consensusRule,
        confidence_threshold: swarm.confidenceThreshold,
        is_active: swarm.isActive,
        created_at: swarm.createdAt,
        updated_at: swarm.updatedAt,
      });
    } catch (err: any) {
      console.warn('[CustomAgentService] Could not persist swarm to DB:', err.message);
    }

    return swarm;
  }

  public async deleteCustomSwarm(id: string, userAddress: string): Promise<boolean> {
    this.inMemorySwarms.delete(id);
    try {
      await supabase
        .from('custom_swarms')
        .delete()
        .eq('id', id)
        .eq('user_address', userAddress.toLowerCase());
      return true;
    } catch {
      return true;
    }
  }

  // ----------------------------------------------------------------------------
  // AI Prompt-to-Agent Generator
  // ----------------------------------------------------------------------------
  public async generateAgentFromPrompt(prompt: string): Promise<Partial<CustomAgentDefinition>> {
    const systemPrompt = `You are the DreamPulse AI Quant Architect. You design autonomous binary options trading strategies for the Somnia blockchain.
Given a trader's natural language concept, generate a structured strategy specification matching this JSON format exactly:
{
  "name": "Strategy Title",
  "description": "Short 1-sentence summary",
  "symbol": "BTC/USD" | "ETH/USD" | "SOL/USD" | "BNB/USD" | "DOGE/USD",
  "timeframe": "1m" | "5m" | "15m" | "1h",
  "strategyType": "MOMENTUM" | "MEAN_REVERSION" | "BREAKOUT" | "VOLATILITY" | "CUSTOM",
  "color": "#2dd4bf" | "#f59e0b" | "#a78bfa",
  "icon": "BoltIcon" | "SparklesIcon" | "AdjustmentsHorizontalIcon",
  "rules": {
    "operator": "AND" | "OR",
    "conditions": [
      {
        "id": "c-1",
        "indicator": "RSI" | "SMA" | "EMA" | "BOLLINGER_UPPER" | "BOLLINGER_LOWER" | "PRICE_DRIFT",
        "period": 9,
        "secondaryPeriod": 21,
        "stdDev": 2.0,
        "operator": "LESS_THAN" | "GREATER_THAN" | "CROSS_ABOVE" | "CROSS_BELOW",
        "value": 0
      }
    ],
    "action": {
      "direction": "CALL" | "PUT",
      "durationSec": 60 | 300 | 900,
      "stakeType": "FIXED",
      "stakeAmount": 10
    },
    "risk": {
      "maxConsecutiveLosses": 2,
      "cooldownMinutes": 3,
      "minPoolPayoutPct": 75
    }
  }
}
If the user mentions moving averages or crosses (e.g. 9/21 EMA), set indicator="EMA", period=9, secondaryPeriod=21, operator="CROSS_ABOVE" or "CROSS_BELOW".
If the user mentions velocity or drift, add a condition with indicator="PRICE_DRIFT", operator="GREATER_THAN" or "LESS_THAN", value=0.0015.
Respond ONLY with valid JSON. No markdown codeblocks, no explanations.`;

    try {
      const rawResponse = await generateStrategyWithGemini({
        systemPrompt,
        userPrompt: `Trader Strategy Request: "${prompt}"`,
        temperature: 0.2,
      });

      if (rawResponse) {
        // Extract JSON if wrapped in markdown
        const cleaned = rawResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        const name = parsed.name || parsed.strategy_name || parsed.title;
        const rules = parsed.rules || parsed.strategy_rules;

        if (name && rules && Array.isArray(rules.conditions) && rules.conditions.length > 0) {
          // Normalize symbol
          let symbol = parsed.symbol || 'BTC/USD';
          if (symbol.includes('SOL')) symbol = 'SOL/USD';
          else if (symbol.includes('ETH')) symbol = 'ETH/USD';
          else if (symbol.includes('BNB')) symbol = 'BNB/USD';
          else if (symbol.includes('DOGE')) symbol = 'DOGE/USD';
          else if (symbol.includes('BTC')) symbol = 'BTC/USD';

          // Normalize timeframe
          let timeframe = parsed.timeframe || '5m';
          if (!['1m', '5m', '15m', '1h'].includes(timeframe)) timeframe = '5m';

          return {
            name,
            description: parsed.description || `AI strategy for ${symbol}`,
            symbol,
            timeframe,
            strategyType: parsed.strategyType || (rules.action?.direction === 'CALL' ? 'MOMENTUM' : 'MEAN_REVERSION'),
            color: parsed.color || (rules.action?.direction === 'CALL' ? '#2dd4bf' : '#f59e0b'),
            icon: parsed.icon || (rules.action?.direction === 'CALL' ? 'BoltIcon' : 'AdjustmentsHorizontalIcon'),
            rules: {
              operator: rules.operator === 'OR' ? 'OR' : 'AND',
              conditions: rules.conditions.map((c: any, idx: number) => ({
                id: c.id || `c-${idx + 1}-${Date.now()}`,
                indicator: c.indicator || 'RSI',
                period: c.period || 14,
                secondaryPeriod: c.secondaryPeriod,
                stdDev: c.stdDev || 2.0,
                operator: c.operator || 'LESS_THAN',
                value: c.value ?? 0,
              })),
              action: {
                direction: rules.action?.direction === 'PUT' ? 'PUT' : 'CALL',
                durationSec: rules.action?.durationSec || (timeframe === '1m' ? 60 : 300),
                stakeType: 'FIXED',
                stakeAmount: rules.action?.stakeAmount || 10,
              },
              risk: {
                maxConsecutiveLosses: rules.risk?.maxConsecutiveLosses || 2,
                cooldownMinutes: rules.risk?.cooldownMinutes || 3,
                minPoolPayoutPct: rules.risk?.minPoolPayoutPct || 75,
              },
            },
          };
        }
      }
    } catch (err: any) {
      console.warn('[CustomAgentService] Gemini generator failed, falling back to rule heuristic:', err.message);
    }

    // Intelligent Deterministic Keyword Fallback
    const p = prompt.toLowerCase();
    const isCall = p.includes('call') || p.includes('buy') || p.includes('long') || p.includes('bounce') || p.includes('dip') || p.includes('golden') || p.includes('above');
    const isEth = p.includes('eth');
    const isSol = p.includes('sol');
    const isBnb = p.includes('bnb');
    const isDoge = p.includes('doge');
    const symbol = isEth ? 'ETH/USD' : isSol ? 'SOL/USD' : isBnb ? 'BNB/USD' : isDoge ? 'DOGE/USD' : 'BTC/USD';
    const is60s = p.includes('60') || p.includes('1m') || p.includes('turbo');
    const is15m = p.includes('15m') || p.includes('15 min');
    const is1h = p.includes('1h') || p.includes('hour');
    const timeframe = is60s ? '1m' : is15m ? '15m' : is1h ? '1h' : '5m';
    const durationSec = is60s ? 60 : is15m ? 900 : is1h ? 3600 : 300;

    const fallbackConditions: ConditionRule[] = [];

    // Parse EMA / Moving Average Cross
    if (p.includes('ema') || p.includes('moving average') || p.includes('cross') || p.includes('golden')) {
      const fast = p.includes('9') ? 9 : 12;
      const slow = p.includes('21') ? 21 : 26;
      fallbackConditions.push({
        id: 'c-ema',
        indicator: 'EMA',
        period: fast,
        secondaryPeriod: slow,
        operator: isCall ? 'CROSS_ABOVE' : 'CROSS_BELOW',
        value: 0,
      });
    }

    // Parse Velocity / Price Drift
    if (p.includes('velocity') || p.includes('drift') || p.includes('momentum') || p.includes('speed') || p.includes('spike')) {
      fallbackConditions.push({
        id: 'c-drift',
        indicator: 'PRICE_DRIFT',
        period: 1,
        operator: isCall ? 'GREATER_THAN' : 'LESS_THAN',
        value: 0.0015,
      });
    }

    // Parse RSI
    if (p.includes('rsi') || p.includes('oversold') || p.includes('overbought')) {
      fallbackConditions.push({
        id: 'c-rsi',
        indicator: 'RSI',
        period: 14,
        operator: isCall ? 'LESS_THAN' : 'GREATER_THAN',
        value: isCall ? (p.includes('25') ? 25 : 30) : (p.includes('75') ? 75 : 70),
      });
    }

    // Parse Bollinger
    if (p.includes('bollinger') || p.includes('band') || p.includes('fade')) {
      fallbackConditions.push({
        id: 'c-bb',
        indicator: isCall ? 'BOLLINGER_LOWER' : 'BOLLINGER_UPPER',
        period: 20,
        stdDev: 2.0,
        operator: isCall ? 'LESS_THAN' : 'GREATER_THAN',
        value: 0,
      });
    }

    // Fallback baseline if no indicators matched
    if (fallbackConditions.length === 0) {
      fallbackConditions.push({
        id: 'c-1',
        indicator: 'RSI',
        period: 14,
        operator: isCall ? 'LESS_THAN' : 'GREATER_THAN',
        value: isCall ? 30 : 70,
      });
      fallbackConditions.push({
        id: 'c-2',
        indicator: isCall ? 'BOLLINGER_LOWER' : 'BOLLINGER_UPPER',
        period: 20,
        stdDev: 2.0,
        operator: isCall ? 'LESS_THAN' : 'GREATER_THAN',
        value: 0,
      });
    }

    const titlePrefix = p.includes('ema') ? 'EMA Golden Cross Rider' : isCall ? 'Momentum Dip Hunter' : 'Exhaustion Mean Reverter';

    return {
      name: `${symbol.split('/')[0]} ${titlePrefix}`,
      description: `Synthesized from prompt: "${prompt.slice(0, 60)}..."`,
      symbol,
      timeframe,
      strategyType: isCall ? 'MOMENTUM' : 'MEAN_REVERSION',
      color: isCall ? '#2dd4bf' : '#f59e0b',
      icon: isCall ? 'BoltIcon' : 'AdjustmentsHorizontalIcon',
      rules: {
        operator: 'AND',
        conditions: fallbackConditions,
        action: {
          direction: isCall ? 'CALL' : 'PUT',
          durationSec,
          stakeType: 'FIXED',
          stakeAmount: 10,
        },
        risk: {
          maxConsecutiveLosses: 2,
          cooldownMinutes: 3,
          minPoolPayoutPct: 78,
        },
      },
    };
  }
}

export const customAgentService = new CustomAgentService();
