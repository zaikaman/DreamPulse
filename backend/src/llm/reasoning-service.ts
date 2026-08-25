import { generateStructuredReasoning, type StructuredAgentThought } from './client.js';

export type AgentRole = 'Volt' | 'Oracle' | 'Titan' | 'Sweeper';

export interface ReasoningContext {
  agentType: AgentRole;
  symbol: string;
  spotPrice: number;
  strikePrice: number;
  timeLeftSeconds: number;
  bestBidYes: number;
  bestAskYes: number;
  impliedProbYes: number;
  fairValueYes: number;
  edgePercentage: number;
  driftPercentage?: number;
  inventory?: number;
  triggerEvent: string;
  actionPlanned: string;
}

const AGENT_SYSTEM_PROMPTS: Record<AgentRole, string> = {
  Volt: `You are Volt, an ultra-fast quantitative Spot Staleness Sniper agent on DreamPulse (Somnia DreamDEX).
Your purpose is to detect rapid underlying asset spot price jumps and exploit lagging limit orders in binary prediction event contracts.
Respond strictly with a valid JSON object matching { "confidence": number, "thought": string, "action": string }.`,

  Oracle: `You are Oracle, a quantitative Volatility Surface Arbitrage agent on DreamPulse (Somnia DreamDEX).
You evaluate discrepancies between market-implied probabilities and Black-Scholes normal cumulative distribution Φ(z).
Respond strictly with a valid JSON object matching { "confidence": number, "thought": string, "action": string }.`,

  Titan: `You are Titan, an Adaptive Two-Sided Market Maker on DreamPulse (Somnia DreamDEX).
You provide continuous liquidity around theoretical fair value Φ(z) while dynamically skewing quotes to manage inventory risk.
Respond strictly with a valid JSON object matching { "confidence": number, "thought": string, "action": string }.`,

  Sweeper: `You are Sweeper, an Autonomous Settlement & Payout Compounding agent on DreamPulse (Somnia DreamDEX).
You identify finalized prediction markets with winning shares and execute gas-efficient batch redemptions.
Respond strictly with a valid JSON object matching { "confidence": number, "thought": string, "action": string }.`,
};

/**
 * Generates an instantaneous quantitative thought log for the real-time AI thought feed.
 */
export async function generateAgentThought(ctx: ReasoningContext): Promise<StructuredAgentThought> {
  const systemPrompt = AGENT_SYSTEM_PROMPTS[ctx.agentType];
  const userPrompt = `Market Context:
Symbol: ${ctx.symbol} | Spot: $${ctx.spotPrice.toFixed(2)} | Strike: $${ctx.strikePrice.toFixed(2)}
Time Remaining: ${ctx.timeLeftSeconds}s
OrderBook: BestBid(YES)=${ctx.bestBidYes.toFixed(2)}, BestAsk(YES)=${ctx.bestAskYes.toFixed(2)}
ImpliedProb: ${(ctx.impliedProbYes * 100).toFixed(1)}% | FairValue Φ(z): ${(ctx.fairValueYes * 100).toFixed(1)}%
Edge: ${(ctx.edgePercentage * 100).toFixed(1)}% | Drift: ${((ctx.driftPercentage || 0) * 100).toFixed(2)}%
Trigger: ${ctx.triggerEvent} | Planned Action: ${ctx.actionPlanned}

Explain your execution decision in JSON format with keys "confidence" (float 0.0 - 1.0) and "thought" (1-2 sentences).`;

  try {
    const rawJson = await generateStructuredReasoning({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
      maxTokens: 180,
    });

    const parsed = JSON.parse(rawJson);
    const confidence = typeof parsed.confidence === 'number' ? Math.min(0.99, Math.max(0.60, parsed.confidence)) : 0.94;
    const thought = (parsed.thought && !parsed.thought.includes('Evaluated quantitative edge on Somnia Shannon CLOB'))
      ? parsed.thought
      : fallbackThought(ctx);

    return {
      agent: ctx.agentType,
      triggerEvent: ctx.triggerEvent,
      confidence: Number(confidence.toFixed(2)),
      action: (ctx.actionPlanned as StructuredAgentThought['action']) || 'HOLD',
      thought,
      metadata: {
        spot: ctx.spotPrice,
        strike: ctx.strikePrice,
        edge: ctx.edgePercentage,
        fairValue: ctx.fairValueYes,
      },
    };
  } catch (_err) {
    return {
      agent: ctx.agentType,
      triggerEvent: ctx.triggerEvent,
      confidence: 0.91,
      action: (ctx.actionPlanned as StructuredAgentThought['action']) || 'HOLD',
      thought: fallbackThought(ctx),
      metadata: {
        spot: ctx.spotPrice,
        strike: ctx.strikePrice,
        edge: ctx.edgePercentage,
        fairValue: ctx.fairValueYes,
      },
    };
  }
}

function fallbackThought(ctx: ReasoningContext): string {
  switch (ctx.agentType) {
    case 'Volt':
      return `Detected ${(Math.abs(ctx.driftPercentage || 0) * 100).toFixed(2)}% spot drift. Resting quote priced at ${ctx.bestAskYes.toFixed(2)} vs fair value ${ctx.fairValueYes.toFixed(2)}. Firing immediate IOC taker order.`;
    case 'Oracle':
      return `Mathematical mispricing detected: Implied probability ${(ctx.impliedProbYes * 100).toFixed(1)}% deviates by ${(ctx.edgePercentage * 100).toFixed(1)}% from Black-Scholes Φ(z) ${(ctx.fairValueYes * 100).toFixed(1)}%.`;
    case 'Titan':
      return `Quoting two-sided liquidity at ${(ctx.fairValueYes * 100).toFixed(1)}% fair value. Spread captured with active inventory rebalancing.`;
    case 'Sweeper':
      return `Market resolved with winning outcome. Claiming payout batch and recycling collateral back to user trading balance.`;
  }
}
