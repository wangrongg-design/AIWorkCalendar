import { Injectable } from "@nestjs/common";

type RedactionKind = "email" | "phone" | "idCard" | "money" | "employee" | "department" | "project" | "attachmentFile" | "customer";

type RedactionEntry = {
  original: string;
  replacement: string;
  kind: RedactionKind;
};

export type AiRedactionStats = {
  total: number;
  byKind: Record<string, number>;
  removedImages: number;
  truncatedStrings: number;
};

export type SafeAiPayload<T> = {
  payload: T;
  stats: AiRedactionStats;
  restore: <R>(value: R) => R;
};

type RedactionContext = {
  entries: RedactionEntry[];
  counters: Record<RedactionKind, number>;
  stats: AiRedactionStats;
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
const ID_CARD_PATTERN = /(?<!\d)[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx](?!\d)/g;
const MONEY_PATTERN = /(?:¥|￥|人民币|RMB|CNY)\s*\d+(?:\.\d+)?(?:\s*(?:元|万元|万))?|\d+(?:\.\d+)?\s*(?:万元|元|块钱|块)/gi;
const CUSTOMER_PATTERN = /[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}(?:有限公司|股份有限公司|集团|科技公司|信息公司|网络公司|客户|银行|医院|学校)/g;

const FIELD_KIND: Record<string, RedactionKind> = {
  userName: "employee",
  requesterName: "employee",
  employeeName: "employee",
  departmentName: "department",
  scopeName: "department",
  projectName: "project",
  fileName: "attachmentFile"
};

@Injectable()
export class AiRedactionService {
  buildSafeAiPayload<T>(input: T, maxStringLength = 2000): SafeAiPayload<T> {
    const context: RedactionContext = {
      entries: [],
      counters: {
        email: 0,
        phone: 0,
        idCard: 0,
        money: 0,
        employee: 0,
        department: 0,
        project: 0,
        attachmentFile: 0,
        customer: 0
      },
      stats: {
        total: 0,
        byKind: {},
        removedImages: 0,
        truncatedStrings: 0
      }
    };

    this.collectKnownBusinessTerms(input, context);
    const payload = this.redactValue(input, context, undefined, maxStringLength) as T;
    return {
      payload,
      stats: context.stats,
      restore: <R>(value: R) => this.restoreValue(value, context) as R
    };
  }

  private collectKnownBusinessTerms(value: unknown, context: RedactionContext, key?: string) {
    if (typeof value === "string") {
      const kind = key ? FIELD_KIND[key] : undefined;
      if (kind && this.shouldMapBusinessTerm(value)) {
        this.addEntry(context, value, kind);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectKnownBusinessTerms(item, context);
      }
      return;
    }
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      this.collectKnownBusinessTerms(childValue, context, childKey);
    }
  }

  private redactValue(value: unknown, context: RedactionContext, key?: string, maxStringLength = 2000): unknown {
    if (key === "dataUrl" || key === "image_url") {
      if (typeof value === "string" && value.length > 0) {
        context.stats.removedImages += 1;
      }
      return null;
    }
    if (typeof value === "string") {
      const fieldKind = key ? FIELD_KIND[key] : undefined;
      let next = fieldKind && this.shouldMapBusinessTerm(value) ? this.addEntry(context, value, fieldKind) : value;
      next = this.redactPatterns(next, context);
      next = this.applyMappings(next, context);
      if (next.length > maxStringLength) {
        context.stats.truncatedStrings += 1;
        next = `${next.slice(0, maxStringLength)}...`;
      }
      return next;
    }
    if (!value || typeof value !== "object") return value;
    if (value instanceof Date) return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.redactValue(item, context, undefined, maxStringLength));
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        this.redactValue(childValue, context, childKey, maxStringLength)
      ])
    );
  }

  private redactPatterns(value: string, context: RedactionContext) {
    return value
      .replace(EMAIL_PATTERN, (match) => this.addEntry(context, match, "email"))
      .replace(PHONE_PATTERN, (match) => this.addEntry(context, match, "phone"))
      .replace(ID_CARD_PATTERN, (match) => this.addEntry(context, match, "idCard"))
      .replace(MONEY_PATTERN, (match) => this.addEntry(context, match, "money"))
      .replace(CUSTOMER_PATTERN, (match) => this.addEntry(context, match, "customer"));
  }

  private applyMappings(value: string, context: RedactionContext) {
    return context.entries
      .filter((entry) => entry.original && entry.original.length >= 2)
      .sort((a, b) => b.original.length - a.original.length)
      .reduce((text, entry) => text.split(entry.original).join(entry.replacement), value);
  }

  private restoreValue(value: unknown, context: RedactionContext): unknown {
    if (typeof value === "string") {
      return context.entries.reduce((text, entry) => text.split(entry.replacement).join(entry.original), value);
    }
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) {
      return value.map((item) => this.restoreValue(item, context));
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, childValue]) => [key, this.restoreValue(childValue, context)])
    );
  }

  private addEntry(context: RedactionContext, original: string, kind: RedactionKind) {
    const normalized = original.trim();
    if (!normalized) return original;
    const existing = context.entries.find((entry) => entry.original === normalized);
    if (existing) return existing.replacement;
    context.counters[kind] += 1;
    const replacement = `[${this.kindLabel(kind)}${context.counters[kind]}]`;
    context.entries.push({ original: normalized, replacement, kind });
    context.stats.total += 1;
    context.stats.byKind[kind] = (context.stats.byKind[kind] ?? 0) + 1;
    return replacement;
  }

  private shouldMapBusinessTerm(value: string) {
    const trimmed = value.trim();
    return trimmed.length >= 2 && trimmed.length <= 80 && !/^\d+(?:\.\d+)?$/.test(trimmed);
  }

  private kindLabel(kind: RedactionKind) {
    const labels: Record<RedactionKind, string> = {
      email: "邮箱",
      phone: "电话",
      idCard: "证件",
      money: "金额",
      employee: "员工",
      department: "部门",
      project: "项目",
      attachmentFile: "附件",
      customer: "客户"
    };
    return labels[kind];
  }
}
