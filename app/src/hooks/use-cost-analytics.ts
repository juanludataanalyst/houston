import { useEffect, useState } from "react";
import { useAgentStore } from "../stores/agents";
import { getEngine } from "../lib/engine";

// Anthropic pricing — $ per million tokens
interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8":  { input: 5.00, output: 25.00, cacheRead: 0.50 },
  "claude-opus-4-7":  { input: 5.00, output: 25.00, cacheRead: 0.50 },
  "claude-sonnet-4-6":{ input: 3.00, output: 15.00, cacheRead: 0.30 },
  "claude-haiku-4-5": { input: 1.00, output: 5.00,  cacheRead: 0.10 },
};

function getPricing(model: string): ModelPricing | null {
  // Match by prefix so date-suffixed IDs ("claude-sonnet-4-6-20250219") still resolve
  for (const [key, price] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return price;
  }
  return null;
}

export function calcTokenCost(
  model: string,
  contextTokens: number,
  outputTokens: number,
  cachedTokens: number,
): number | null {
  const p = getPricing(model);
  if (!p) return null;
  const nonCached = Math.max(0, contextTokens - cachedTokens);
  return (nonCached * p.input + cachedTokens * p.cacheRead + outputTokens * p.output) / 1_000_000;
}

export interface AgentCost {
  agentName: string;
  agentPath: string;
  totalCost: number;
  sessionCount: number;  // conversations
  totalTurns: number;    // API calls
  totalTokens: number;
  cachedTokens: number;
  totalDurationMs: number;
}

export interface ModelMetrics {
  model: string;
  sessionCount: number;
  totalTokens: number;
  cachedTokens: number;
  totalCost: number;
}

export interface DailyMetrics {
  date: string;
  cost: number;
  tokens: number;
}

export interface HourlyMetrics {
  hour: number; // 0–23
  tokens: number;
  sessions: number;
}

/** One entry per conversation (activity) — aggregates all its API turns. */
export interface SessionResult {
  agentName: string;
  agentPath: string;
  model: string;
  cost: number;
  hasCost: boolean;
  durationMs: number;
  contextTokens: number;
  outputTokens: number;
  cachedTokens: number;
  turns: number;  // number of API calls within this conversation
  date: string;   // "YYYY-MM-DD" or ""
  hour: number;   // 0–23 or -1
}

export interface AggregatedMetrics {
  totalCost: number;
  totalSessions: number;
  totalTokens: number;
  cachedTokens: number;
  cacheEfficiencyPct: number;
  hasCostData: boolean;
  byAgent: AgentCost[];
  byModel: ModelMetrics[];
  byDay: DailyMetrics[];
  byHour: HourlyMetrics[];
}

export interface CostAnalytics extends AggregatedMetrics {
  sessions: SessionResult[];   // raw, for filter re-aggregation
  models: string[];            // unique model names
  agents: { name: string; path: string }[];
  loading: boolean;
  error: string | null;
}

const CONCURRENCY = 8;

async function limitedAll<T>(
  items: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    results.push(...(await Promise.all(chunk.map((fn) => fn()))));
  }
  return results;
}

export function aggregate(sessions: SessionResult[]): AggregatedMetrics {
  const agentMap = new Map<string, AgentCost>();
  const modelMap = new Map<string, ModelMetrics>();
  const dayMap = new Map<string, { cost: number; tokens: number }>();
  const hourMap = new Map<number, { tokens: number; sessions: number }>();
  let totalCost = 0;
  let totalTokens = 0;
  let cachedTokens = 0;
  let hasCostData = false;

  for (const r of sessions) {
    totalCost += r.cost;
    if (r.hasCost) hasCostData = true;
    const tokens = r.contextTokens + r.outputTokens;
    totalTokens += tokens;
    cachedTokens += r.cachedTokens;

    // by agent
    const ag = agentMap.get(r.agentPath);
    if (ag) {
      ag.totalCost += r.cost;
      ag.sessionCount += 1;
      ag.totalTurns += r.turns;
      ag.totalTokens += tokens;
      ag.cachedTokens += r.cachedTokens;
      ag.totalDurationMs += r.durationMs;
    } else {
      agentMap.set(r.agentPath, {
        agentName: r.agentName,
        agentPath: r.agentPath,
        totalCost: r.cost,
        sessionCount: 1,
        totalTurns: r.turns,
        totalTokens: tokens,
        cachedTokens: r.cachedTokens,
        totalDurationMs: r.durationMs,
      });
    }

    // by model
    const md = modelMap.get(r.model);
    if (md) {
      md.sessionCount += 1;
      md.totalTokens += tokens;
      md.cachedTokens += r.cachedTokens;
      md.totalCost += r.cost;
    } else {
      modelMap.set(r.model, {
        model: r.model,
        sessionCount: 1,
        totalTokens: tokens,
        cachedTokens: r.cachedTokens,
        totalCost: r.cost,
      });
    }

    // by day
    if (r.date) {
      const entry = dayMap.get(r.date) ?? { cost: 0, tokens: 0 };
      entry.cost += r.cost;
      entry.tokens += tokens;
      dayMap.set(r.date, entry);
    }

    // by hour
    if (r.hour >= 0) {
      const h = hourMap.get(r.hour) ?? { tokens: 0, sessions: 0 };
      h.tokens += tokens;
      h.sessions += 1;
      hourMap.set(r.hour, h);
    }
  }

  const byAgent = [...agentMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const byModel = [...modelMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);
  const byDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => ({ date, cost: m.cost, tokens: m.tokens }));
  const byHour: HourlyMetrics[] = Array.from({ length: 24 }, (_, h) => {
    const m = hourMap.get(h) ?? { tokens: 0, sessions: 0 };
    return { hour: h, tokens: m.tokens, sessions: m.sessions };
  });

  return {
    totalCost,
    totalSessions: sessions.length,
    totalTokens,
    cachedTokens,
    cacheEfficiencyPct: totalTokens > 0 ? Math.round((cachedTokens / totalTokens) * 100) : 0,
    hasCostData,
    byAgent,
    byModel,
    byDay,
    byHour,
  };
}

export function useCostAnalytics(): CostAnalytics {
  const agents = useAgentStore((s) => s.agents);
  const [state, setState] = useState<CostAnalytics>({
    totalCost: 0,
    totalSessions: 0,
    totalTokens: 0,
    cachedTokens: 0,
    cacheEfficiencyPct: 0,
    hasCostData: false,
    byAgent: [],
    byModel: [],
    byDay: [],
    byHour: [],
    sessions: [],
    models: [],
    agents: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (agents.length === 0) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const engine = getEngine();
        const agentPaths = agents.map((a) => a.folderPath);
        const conversations = await engine.listAllConversations(agentPaths);
        const finished = conversations.filter((c) => c.status !== "running");

        const tasks = finished.map((conv) => async (): Promise<SessionResult | null> => {
          try {
            const history = await engine.loadChatHistory(conv.agent_path, conv.session_key);
            const finalResults = history.filter((e) => e.feed_type === "final_result");
            if (finalResults.length === 0) return null;

            const model = conv.model ?? "unknown";
            const updatedAt = conv.updated_at ?? "";

            // Aggregate all API turns into one conversation-level result
            let totalContextTokens = 0;
            let totalOutputTokens = 0;
            let totalCachedTokens = 0;
            let totalDurationMs = 0;

            for (const entry of finalResults) {
              const data = entry.data as {
                duration_ms?: number | null;
                usage?: {
                  context_tokens?: number;
                  output_tokens?: number;
                  cached_tokens?: number;
                } | null;
              };
              totalContextTokens += data.usage?.context_tokens ?? 0;
              totalOutputTokens += data.usage?.output_tokens ?? 0;
              totalCachedTokens += data.usage?.cached_tokens ?? 0;
              totalDurationMs += data.duration_ms ?? 0;
            }

            const calculatedCost = calcTokenCost(model, totalContextTokens, totalOutputTokens, totalCachedTokens);

            return {
              agentName: conv.agent_name,
              agentPath: conv.agent_path,
              model,
              cost: calculatedCost ?? 0,
              hasCost: calculatedCost !== null,
              durationMs: totalDurationMs,
              contextTokens: totalContextTokens,
              outputTokens: totalOutputTokens,
              cachedTokens: totalCachedTokens,
              turns: finalResults.length,
              date: updatedAt.slice(0, 10),
              hour: updatedAt ? new Date(updatedAt).getHours() : -1,
            };
          } catch {
            return null;
          }
        });

        const nested = await limitedAll(tasks, CONCURRENCY);
        if (cancelled) return;

        const sessions = nested.filter((s): s is SessionResult => s !== null);
        const agg = aggregate(sessions);

        const models = [...new Set(sessions.map((s) => s.model).filter((m) => m !== "unknown"))];
        const agentSet = new Map<string, string>();
        for (const s of sessions) agentSet.set(s.agentPath, s.agentName);
        const agentsList = [...agentSet.entries()].map(([path, name]) => ({ path, name }));

        setState({
          ...agg,
          sessions,
          models,
          agents: agentsList,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: String(err) }));
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agents]);

  return state;
}
