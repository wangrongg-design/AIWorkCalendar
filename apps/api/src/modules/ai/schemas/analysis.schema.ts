export type WorkLogAnalysisResult = {
  category: string;
  achievements: string[];
  risks: string[];
  blockers: string[];
  keywords: string[];
  tags: string[];
  timeReasonableness: string;
  summary: string;
};

export type ReportResult = {
  completed: string[];
  progress: string[];
  risks: string[];
  nextPlan: string[];
  hours: {
    total: number;
    byUser: Array<{ userName: string; hours: number }>;
  };
  summary: string;
};

export type WorkLogDraftItem = {
  date: string;
  kind: "DAILY" | "PLAN";
  title: string;
  content: string;
  hours: number;
  startTime: string | null;
  endTime: string | null;
  projectHint: string | null;
  confidence: number;
  missingFields: string[];
};

export type WorkLogDraftResult = WorkLogDraftItem & {
  assistantMessage: string;
  items: WorkLogDraftItem[];
};

export type WorkLogSuggestionAction = "append_reply" | "select_project" | "confirm_split" | "confirm_single" | "mark_blocker" | "add_next_plan";

export type WorkLogSuggestion = {
  type: "quick_reply" | "project" | "split" | "risk" | "none_project";
  label: string;
  value: string | null;
  action: WorkLogSuggestionAction;
  projectId: string | null;
};

export type WorkLogSuggestionDraftItem = {
  title: string;
  content: string;
  projectId: string | null;
  projectHint: string | null;
  risk: string;
  nextPlan: string;
  hours: number | null;
};

export type WorkLogSuggestionResult = {
  status: "idle" | "need_clarification" | "need_split_confirmation" | "ready_to_submit";
  assistantMessage: string;
  qualityScore: number;
  canSubmit: boolean;
  suggestions: WorkLogSuggestion[];
  draftItems: WorkLogSuggestionDraftItem[];
};

export const workLogAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "achievements",
    "risks",
    "blockers",
    "keywords",
    "tags",
    "timeReasonableness",
    "summary"
  ],
  properties: {
    category: { type: "string" },
    achievements: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    timeReasonableness: { type: "string" },
    summary: { type: "string" }
  }
} as const;

export const reportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["completed", "progress", "risks", "nextPlan", "hours", "summary"],
  properties: {
    completed: { type: "array", items: { type: "string" } },
    progress: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    nextPlan: { type: "array", items: { type: "string" } },
    hours: {
      type: "object",
      additionalProperties: false,
      required: ["total", "byUser"],
      properties: {
        total: { type: "number" },
        byUser: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["userName", "hours"],
            properties: {
              userName: { type: "string" },
              hours: { type: "number" }
            }
          }
        }
      }
    },
    summary: { type: "string" }
  }
} as const;

export const workLogDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "date",
    "kind",
    "title",
    "content",
    "hours",
    "startTime",
    "endTime",
    "projectHint",
    "confidence",
    "missingFields",
    "assistantMessage",
    "items"
  ],
  properties: {
    date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    kind: { type: "string", enum: ["DAILY", "PLAN"] },
    title: { type: "string" },
    content: { type: "string" },
    hours: { type: "number", minimum: 0, maximum: 24 },
    startTime: { anyOf: [{ type: "string" }, { type: "null" }] },
    endTime: { anyOf: [{ type: "string" }, { type: "null" }] },
    projectHint: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    missingFields: { type: "array", items: { type: "string" } },
    assistantMessage: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "kind", "title", "content", "hours", "startTime", "endTime", "projectHint", "confidence", "missingFields"],
        properties: {
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          kind: { type: "string", enum: ["DAILY", "PLAN"] },
          title: { type: "string" },
          content: { type: "string" },
          hours: { type: "number", minimum: 0, maximum: 24 },
          startTime: { anyOf: [{ type: "string" }, { type: "null" }] },
          endTime: { anyOf: [{ type: "string" }, { type: "null" }] },
          projectHint: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          missingFields: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} as const;

export const workLogSuggestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "assistantMessage", "qualityScore", "canSubmit", "suggestions", "draftItems"],
  properties: {
    status: { type: "string", enum: ["idle", "need_clarification", "need_split_confirmation", "ready_to_submit"] },
    assistantMessage: { type: "string" },
    qualityScore: { type: "number", minimum: 0, maximum: 100 },
    canSubmit: { type: "boolean" },
    suggestions: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label", "value", "action", "projectId"],
        properties: {
          type: { type: "string", enum: ["quick_reply", "project", "split", "risk", "none_project"] },
          label: { type: "string" },
          value: { anyOf: [{ type: "string" }, { type: "null" }] },
          action: { type: "string", enum: ["append_reply", "select_project", "confirm_split", "confirm_single", "mark_blocker", "add_next_plan"] },
          projectId: { anyOf: [{ type: "string" }, { type: "null" }] }
        }
      }
    },
    draftItems: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "content", "projectId", "projectHint", "risk", "nextPlan", "hours"],
        properties: {
          title: { type: "string" },
          content: { type: "string" },
          projectId: { anyOf: [{ type: "string" }, { type: "null" }] },
          projectHint: { anyOf: [{ type: "string" }, { type: "null" }] },
          risk: { type: "string" },
          nextPlan: { type: "string" },
          hours: { anyOf: [{ type: "number", minimum: 0, maximum: 24 }, { type: "null" }] }
        }
      }
    }
  }
} as const;
