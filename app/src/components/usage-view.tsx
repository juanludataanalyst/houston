import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart2, Zap, Clock, Layers, Info, Cpu, ChevronDown, DollarSign } from "lucide-react";
import { cn } from "@houston-ai/core";
import { useCostAnalytics, aggregate, type SessionResult } from "../hooks/use-cost-analytics";
import { LineChart } from "./usage-chart";
import { TaskTimeline } from "./task-timeline";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n === 0) return "$0.00";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  if (n >= 0.0001) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(8)}`;
}

function shortModel(model: string): string {
  // "claude-sonnet-4-6" → "Sonnet 4.6", "claude-opus-4-8" → "Opus 4.8"
  const m = model.replace(/^claude-/, "");
  const parts = m.split("-");
  if (parts.length >= 2) {
    const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const version = parts.slice(1).join(".").replace(/-/g, ".");
    return `${name} ${version}`;
  }
  return model;
}

type FilterKind = "all" | "agent" | "model";
interface Filter {
  kind: FilterKind;
  value: string; // agentPath or model name
  label: string;
}

function applyFilter(sessions: SessionResult[], filter: Filter): SessionResult[] {
  if (filter.kind === "all") return sessions;
  if (filter.kind === "agent") return sessions.filter((s) => s.agentPath === filter.value);
  return sessions.filter((s) => s.model === filter.value);
}

export function UsageView() {
  const { t } = useTranslation("shell");
  const data = useCostAnalytics();
  const [filter, setFilter] = useState<Filter>(() => ({ kind: "all", value: "", label: t("usage.filterAll") }));
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Build dropdown options
  const filterOptions = useMemo<Filter[]>(() => {
    const opts: Filter[] = [{ kind: "all", value: "", label: t("usage.filterAll") }];
    if (data.agents.length > 1) {
      for (const ag of data.agents) {
        opts.push({ kind: "agent", value: ag.path, label: ag.name });
      }
    }
    for (const m of data.models) {
      opts.push({ kind: "model", value: m, label: shortModel(m) });
    }
    return opts;
  }, [data.agents, data.models, t]);

  // Re-aggregate when filter changes
  const metrics = useMemo(() => {
    if (filter.kind === "all") return data;
    return aggregate(applyFilter(data.sessions, filter));
  }, [data, filter]);

  if (data.loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BarChart2 className="h-8 w-8 text-muted-foreground animate-pulse" />
          <p className="text-sm text-muted-foreground">{t("usage.loading")}</p>
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-destructive">{data.error}</p>
      </div>
    );
  }

  const maxAgentTokens = Math.max(...metrics.byAgent.map((a) => a.totalTokens), 1);
  const maxModelTokens = Math.max(...metrics.byModel.map((m) => m.totalTokens), 1);
  const recentDays = metrics.byDay.slice(-14);
  const useTokensForDay = !metrics.hasCostData;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Header + filter dropdown */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("usage.title")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("usage.subtitle")}</p>
          </div>

          {filterOptions.length > 1 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setDropdownOpen((o) => !o)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                  dropdownOpen && "border-foreground/30",
                )}
              >
                {filter.kind !== "all" && (
                  <span className="text-xs text-muted-foreground">
                    {filter.kind === "agent" ? t("usage.filterAgent") : t("usage.filterModel")}:
                  </span>
                )}
                <span className="max-w-[180px] truncate">{filter.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", dropdownOpen && "rotate-180")} />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-border bg-card shadow-lg py-1 text-sm">
                  {filterOptions.map((opt) => {
                    const isSelected = opt.kind === filter.kind && opt.value === filter.value;
                    return (
                      <button
                        key={`${opt.kind}-${opt.value}`}
                        onClick={() => { setFilter(opt); setDropdownOpen(false); }}
                        className={cn(
                          "w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-muted transition-colors",
                          isSelected && "bg-muted font-medium",
                        )}
                      >
                        {opt.kind !== "all" && (
                          <span className="text-xs text-muted-foreground w-12 shrink-0">
                            {opt.kind === "agent" ? t("usage.filterAgent") : t("usage.filterModel")}
                          </span>
                        )}
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {(filter.kind === "agent" || (filter.kind === "all" && data.agents.length === 1)) && (
          <Section title={t("usage.taskTimeline")}>
            <p className="text-xs text-muted-foreground -mt-2 mb-3">{t("usage.taskTimelineSubtitle")}</p>
            <TaskTimeline agentPath={filter.kind === "agent" ? filter.value : data.agents[0].path} />
          </Section>
        )}

        {/* Close dropdown on outside click */}
        {dropdownOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t("usage.claudeOnly")}</span>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {metrics.hasCostData ? (
            <KpiCard icon={<DollarSign className="h-4 w-4" />} label={t("usage.totalSpend")} value={fmtCost(metrics.totalCost)} highlight />
          ) : (
            <KpiCard icon={<Cpu className="h-4 w-4" />} label={t("usage.totalTokens")} value={fmtTokens(metrics.totalTokens)} />
          )}
          <KpiCard icon={<Layers className="h-4 w-4" />} label={t("usage.totalSessions")} value={String(metrics.totalSessions)} />
          <KpiCard icon={<Zap className="h-4 w-4" />} label={t("usage.cacheEfficiency")} value={`${metrics.cacheEfficiencyPct}%`} highlight={metrics.cacheEfficiencyPct > 40} />
          {metrics.hasCostData ? (
            <KpiCard icon={<Clock className="h-4 w-4" />} label={t("usage.avgCostPerSession")} value={metrics.totalSessions > 0 ? fmtCost(metrics.totalCost / metrics.totalSessions) : "$0.00"} />
          ) : (
            <KpiCard icon={<Clock className="h-4 w-4" />} label={t("usage.cachedTokens")} value={fmtTokens(metrics.cachedTokens)} highlight={metrics.cacheEfficiencyPct > 40} />
          )}
        </div>

        {metrics.hasCostData && (
          <div className="grid grid-cols-2 gap-4">
            <KpiCard icon={<Cpu className="h-4 w-4" />} label={t("usage.totalTokens")} value={fmtTokens(metrics.totalTokens)} />
            <KpiCard icon={<Clock className="h-4 w-4" />} label={t("usage.cachedTokens")} value={`${fmtTokens(metrics.cachedTokens)} (${metrics.cacheEfficiencyPct}%)`} />
          </div>
        )}

        {/* Breakdown by model */}
        {metrics.byModel.length > 0 && (
          <Section title={t("usage.byModel")}>
            <div className="space-y-3">
              {metrics.byModel.map((m) => (
                <div key={m.model} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium font-mono text-xs">{m.model}</span>
                    <div className="flex items-center gap-3 text-muted-foreground text-xs shrink-0">
                      <span>{m.sessionCount} {t("usage.sessions")}</span>
                      <span className="font-medium text-foreground">{fmtTokens(m.totalTokens)} {t("usage.tokens")}</span>
                      {metrics.hasCostData && m.totalCost > 0 && <span>{fmtCost(m.totalCost)}</span>}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-foreground/70 transition-all" style={{ width: `${(m.totalTokens / maxModelTokens) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Breakdown by agent (only show when multiple agents or "all" view) */}
        {metrics.byAgent.length > 1 && (
          <Section title={t("usage.byAgent")}>
            <div className="space-y-3">
              {metrics.byAgent.map((agent) => (
                <div key={agent.agentPath} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[60%]">{agent.agentName}</span>
                    <div className="flex items-center gap-3 text-muted-foreground text-xs shrink-0">
                      <span>{agent.sessionCount} {t("usage.sessions")} · {agent.totalTurns} {t("usage.turns")}</span>
                      <span className="font-medium text-foreground">{fmtTokens(agent.totalTokens)} {t("usage.tokens")}</span>
                      {metrics.hasCostData && agent.totalCost > 0 && <span>{fmtCost(agent.totalCost)}</span>}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${(agent.totalTokens / maxAgentTokens) * 100}%` }} />
                  </div>
                  {agent.totalTokens > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t("usage.cacheHit", { pct: Math.round((agent.cachedTokens / agent.totalTokens) * 100) })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Tokens by hour */}
        {metrics.byHour.some((h) => h.tokens > 0) && (
          <Section title={t("usage.byHour")}>
            <LineChart
              values={metrics.byHour.map((h) => h.tokens)}
              xLabels={metrics.byHour.map((h) => h.hour % 6 === 0 ? `${String(h.hour).padStart(2, "0")}h` : null)}
              tooltips={metrics.byHour.map((h) => {
                const lbl = `${String(h.hour).padStart(2, "0")}h`;
                return h.tokens > 0 ? `${lbl}: ${fmtTokens(h.tokens)} (${h.sessions}s)` : lbl;
              })}
              caption={t("usage.captionByHour")}
            />
          </Section>
        )}

        {/* Daily trend */}
        {recentDays.length > 0 && (
          <Section title={t("usage.dailyTrend")}>
            <LineChart
              values={recentDays.map((d) => useTokensForDay ? d.tokens : d.cost)}
              xLabels={recentDays.map((d, i) => (i === 0 || i === recentDays.length - 1 || i % 3 === 0) ? d.date.slice(5) : null)}
              tooltips={recentDays.map((d) => useTokensForDay ? `${d.date.slice(5)}: ${fmtTokens(d.tokens)} tokens` : `${d.date.slice(5)}: ${fmtCost(d.cost)}`)}
              caption={useTokensForDay ? t("usage.captionByDay") : t("usage.captionByDayCost")}
            />
          </Section>
        )}

        {metrics.totalSessions === 0 && (
          <div className="text-center py-12">
            <BarChart2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("usage.noData")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}<span>{label}</span></div>
      <p className={cn("text-2xl font-semibold tabular-nums", highlight && "text-green-500")}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  );
}
