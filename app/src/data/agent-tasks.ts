export interface AgentTask {
  id: string;
  label: string;
  estimatedMinutes: number;
}

export const PERSONAL_ASSISTANT_TASKS: AgentTask[] = [
  { id: "plan_trip",          label: "Plan a trip or vacation",          estimatedMinutes: 180 },
  { id: "write_email",        label: "Write or reply to an email",       estimatedMinutes: 20  },
  { id: "compare_products",   label: "Compare products before buying",   estimatedMinutes: 45  },
  { id: "find_gift",          label: "Find gift ideas",                  estimatedMinutes: 30  },
  { id: "meal_plan",          label: "Plan meals or find recipes",       estimatedMinutes: 30  },
  { id: "summarize_doc",      label: "Summarize a long document",        estimatedMinutes: 25  },
  { id: "draft_message",      label: "Draft a message or text",          estimatedMinutes: 15  },
  { id: "plan_event",         label: "Plan an event or celebration",     estimatedMinutes: 60  },
  { id: "learn_topic",        label: "Learn about a new topic",          estimatedMinutes: 60  },
  { id: "create_list",        label: "Create a shopping or to-do list",  estimatedMinutes: 15  },
  { id: "budget_plan",        label: "Help with a personal budget",      estimatedMinutes: 45  },
  { id: "find_entertainment", label: "Find something to watch or read",  estimatedMinutes: 20  },
];

export const TASK_MAP = new Map(PERSONAL_ASSISTANT_TASKS.map((t) => [t.id, t]));
