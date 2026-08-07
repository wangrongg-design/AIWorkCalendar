"use client";

const autosaveVersion = 1;
const autosaveTtlMs = 48 * 60 * 60 * 1000;

export type WorkLogFillAutosave<TMessage, TPreview, TAnalysis> = {
  version: typeof autosaveVersion;
  savedAt: string;
  date: string;
  aiInput: string;
  lastInput: string;
  messages: TMessage[];
  draftPreview: TPreview | null;
  suggestionAnalysis: TAnalysis | null;
  attachmentMetadata: Array<{
    fileName: string;
    mimeType?: string | null;
    status?: string | null;
  }>;
};

export function workLogFillAutosaveKey(userId: string | undefined | null, tenantId: string | undefined | null, date: string) {
  return `work-log-fill:${tenantId ?? "tenant"}:${userId ?? "user"}:${date}`;
}

export function readWorkLogFillAutosave<TMessage, TPreview, TAnalysis>(key: string): WorkLogFillAutosave<TMessage, TPreview, TAnalysis> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkLogFillAutosave<TMessage, TPreview, TAnalysis>;
    if (parsed.version !== autosaveVersion || !parsed.savedAt) {
      window.localStorage.removeItem(key);
      return null;
    }
    const savedAt = new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(savedAt) || Date.now() - savedAt > autosaveTtlMs) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

export function writeWorkLogFillAutosave<TMessage, TPreview, TAnalysis>(
  key: string,
  value: Omit<WorkLogFillAutosave<TMessage, TPreview, TAnalysis>, "version" | "savedAt">
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    key,
    JSON.stringify({
      ...value,
      version: autosaveVersion,
      savedAt: new Date().toISOString()
    })
  );
}

export function clearWorkLogFillAutosave(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}
