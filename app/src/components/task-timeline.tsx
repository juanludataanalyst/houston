import { useTranslation } from "react-i18next";
import { Clock, CheckCircle2 } from "lucide-react";
import { useTaskTimeline } from "../hooks/use-task-timeline";
import { LineChart } from "./usage-chart";

export function fmtTime(minutes: number): string {
  if (minutes >= 60) {
    const h = minutes / 60;
    return `~${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  }
  return `~${minutes}min`;
}

function minutesByDate(items: { date: string; estimatedMinutes: number }[]): [string, number][] {
  const byDate = new Map<string, number>();
  for (const item of items) byDate.set(item.date, (byDate.get(item.date) ?? 0) + item.estimatedMinutes);
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function TaskTimeline({ agentPath }: { agentPath: string }) {
  const { t } = useTranslation("shell");
  const { items, totalMinutes, loading, error } = useTaskTimeline(agentPath);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 animate-pulse" />
        <span>{t("usage.analyzingTasks")}</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive py-2">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{t("usage.noTasksFound")}</p>;
  }

  const days = minutesByDate(items);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-green-500/20 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("usage.totalTimeSaved")}</p>
        <p className="text-5xl font-semibold tabular-nums text-green-500 leading-tight mt-1">{fmtTime(totalMinutes)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t("usage.timeSavedAcross", { count: items.length })}
        </p>

        {days.length > 1 && (
          <div className="mt-5 text-green-500">
            <LineChart
              values={days.map(([, minutes]) => minutes)}
              xLabels={days.map(([date], i) => (i === 0 || i === days.length - 1 || i % 3 === 0) ? date.slice(5) : null)}
              tooltips={days.map(([date, minutes]) => `${date.slice(5)}: ${fmtTime(minutes)} ${t("usage.saved")}`)}
              caption={t("usage.captionTimeSaved")}
            />
          </div>
        )}
      </div>

      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground shrink-0 w-14">{item.date.slice(5)}</span>
              <span className="text-sm truncate">{item.label}</span>
            </div>
            <span className="text-xs text-muted-foreground shrink-0 ml-4 tabular-nums">
              {fmtTime(item.estimatedMinutes)} {t("usage.saved")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
