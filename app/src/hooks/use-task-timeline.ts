import { useEffect, useState } from "react";
import { getEngine } from "../lib/engine";
import { PERSONAL_ASSISTANT_TASKS, TASK_MAP } from "../data/agent-tasks";
import type { TaskCandidate } from "@houston-ai/engine-client";

export interface TimelineItem {
  date: string;
  taskId: string;
  label: string;
  estimatedMinutes: number;
}

export interface TaskTimeline {
  items: TimelineItem[];
  totalMinutes: number;
  loading: boolean;
  error: string | null;
}

const CONCURRENCY = 4;

async function limitedAll<T>(items: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += limit) {
    results.push(...(await Promise.all(items.slice(i, i + limit).map((fn) => fn()))));
  }
  return results;
}

const TASK_CANDIDATES: TaskCandidate[] = PERSONAL_ASSISTANT_TASKS.map(({ id, label }) => ({ id, label }));

export function useTaskTimeline(agentPath: string | null): TaskTimeline {
  const [state, setState] = useState<TaskTimeline>({
    items: [],
    totalMinutes: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!agentPath) {
      setState({ items: [], totalMinutes: 0, loading: false, error: null });
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const engine = getEngine();
        const conversations = await engine.listAllConversations([agentPath!]);
        const finished = conversations.filter((c) => c.status !== "running");

        const tasks = finished.map((conv) => async (): Promise<TimelineItem[]> => {
          try {
            const text = `${conv.title}${conv.description ? `. ${conv.description}` : ""}`;
            const matched = await engine.classifyTasks(text, TASK_CANDIDATES, agentPath!);
            const date = (conv.updated_at ?? "").slice(0, 10);
            return matched
              .map((id) => {
                const task = TASK_MAP.get(id);
                if (!task) return null;
                return { date, taskId: id, label: task.label, estimatedMinutes: task.estimatedMinutes };
              })
              .filter((item): item is TimelineItem => item !== null);
          } catch {
            return [];
          }
        });

        const nested = await limitedAll(tasks, CONCURRENCY);
        if (cancelled) return;

        const items = nested
          .flat()
          .sort((a, b) => a.date.localeCompare(b.date));
        const totalMinutes = items.reduce((acc, item) => acc + item.estimatedMinutes, 0);

        setState({ items, totalMinutes, loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ items: [], totalMinutes: 0, loading: false, error: String(err) });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agentPath]);

  return state;
}
