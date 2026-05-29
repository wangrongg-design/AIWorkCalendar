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
  confidence: number;
  missingFields: string[];
};

export type WorkLogDraftResult = WorkLogDraftItem & {
  assistantMessage: string;
  items: WorkLogDraftItem[];
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
    confidence: { type: "number", minimum: 0, maximum: 1 },
    missingFields: { type: "array", items: { type: "string" } },
    assistantMessage: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["date", "kind", "title", "content", "hours", "startTime", "endTime", "confidence", "missingFields"],
        properties: {
          date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          kind: { type: "string", enum: ["DAILY", "PLAN"] },
          title: { type: "string" },
          content: { type: "string" },
          hours: { type: "number", minimum: 0, maximum: 24 },
          startTime: { anyOf: [{ type: "string" }, { type: "null" }] },
          endTime: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          missingFields: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
} as const;
