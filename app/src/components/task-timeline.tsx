import { useTranslation } from "react-i18next";
import { Clock, CheckCircle2 } from "lucide-react";
import { useTaskTimeline } from "../hooks/use-task-timeline";

function fmtTime(minutes: number): string {
  if (minutes >= 60) {
    const h = minutes / 60;
    return `~${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  }
  return `~${minutes}min`;
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

  return (
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
      <div className="flex items-center justify-between pt-3 font-medium text-sm">
        <span>{t("usage.totalTimeSaved")}</span>
        <span className="tabular-nums">{fmtTime(totalMinutes)}</span>
      </div>
    </div>
  );
}
