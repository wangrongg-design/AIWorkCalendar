import { BadRequestException, Injectable } from "@nestjs/common";
import { CommunicationFileDownloadStatus, CommunicationFileKind, WecomExternalConsentStatus } from "@prisma/client";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type WecomArchiveMessage = {
  msgId?: string;
  seq?: string | number | bigint;
  chatId?: string;
  chatName?: string;
  senderWecomUserId?: string;
  senderName?: string;
  senderType?: "INTERNAL" | "EXTERNAL";
  externalUserId?: string;
  externalName?: string;
  externalConsentStatus?: WecomExternalConsentStatus;
  content?: string;
  sentAt?: string;
  msgType?: "TEXT" | "FILE" | "IMAGE" | "VOICE" | "LINK" | "OTHER";
  files?: Array<{
    sdkFileId?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    kind?: CommunicationFileKind;
    downloadStatus?: CommunicationFileDownloadStatus;
    storagePath?: string;
    textContent?: string;
    aiSummary?: string;
    error?: string;
  }>;
};

export type WecomArchivePullOptions = {
  tenantId: string;
  integrationId: string;
  corpId: string;
  msgAuditSecretRef: string;
  rsaPrivateKeyRef: string;
  sourceId?: string;
  chatId?: string;
  seq: bigint;
  limit?: number;
  syncFiles: boolean;
};

export type WecomArchivePullResult = {
  messages: WecomArchiveMessage[];
  nextSeq: bigint;
  rawCount: number;
  hasMore: boolean;
  provider: "official" | "mock";
};

type AdapterOperation = "test" | "pull";

@Injectable()
export class WecomMsgAuditWorker {
  getMode() {
    const configured = process.env.WECOM_MSGAUDIT_MODE?.trim().toLowerCase();
    if (configured === "official" || configured === "mock") return configured;
    return process.env.NODE_ENV === "production" ? "official" : "mock";
  }

  getRuntimeStatus() {
    const mode = this.getMode();
    const adapterCommand = process.env.WECOM_MSGAUDIT_ADAPTER_CMD?.trim() || null;
    return {
      mode,
      adapterConfigured: Boolean(adapterCommand),
      adapterCommand: adapterCommand ? "configured" : null,
      officialReady: mode === "official" && Boolean(adapterCommand),
      mockAllowed: mode === "mock"
    };
  }

  async testConnection(options: Omit<WecomArchivePullOptions, "sourceId" | "chatId" | "seq" | "limit" | "syncFiles">) {
    if (this.getMode() === "mock") {
      return {
        ok: true,
        provider: "mock" as const,
        message: "当前为本地演示模式，未连接真实企业微信会话内容存档 SDK。"
      };
    }
    await this.runOfficialAdapter("test", {
      tenantId: options.tenantId,
      integrationId: options.integrationId,
      corpId: options.corpId,
      msgAuditSecret: await this.resolveSecretRef(options.msgAuditSecretRef, "会话内容存档 secret"),
      rsaPrivateKey: await this.resolveSecretRef(options.rsaPrivateKeyRef, "RSA 私钥")
    });
    return {
      ok: true,
      provider: "official" as const,
      message: "企业微信会话内容存档 SDK 适配器可用。"
    };
  }

  async pullArchive(options: WecomArchivePullOptions): Promise<WecomArchivePullResult> {
    if (this.getMode() === "mock") {
      const today = new Date().toISOString().slice(0, 10);
      const sourceId = options.sourceId ?? options.chatId ?? "demo-general-chat";
      const messages = this.buildDemoBatch(sourceId, today).map((item, index) => ({
        ...item,
        seq: options.seq + BigInt(index + 1),
        chatId: options.chatId ?? sourceId,
        chatName: options.chatId ? undefined : "企业微信演示群"
      }));
      return {
        messages,
        nextSeq: options.seq + BigInt(messages.length),
        rawCount: messages.length,
        hasMore: false,
        provider: "mock"
      };
    }

    const storageDir = await this.ensureMediaStorageDir(options.tenantId);
    const payload = await this.runOfficialAdapter("pull", {
      tenantId: options.tenantId,
      integrationId: options.integrationId,
      corpId: options.corpId,
      msgAuditSecret: await this.resolveSecretRef(options.msgAuditSecretRef, "会话内容存档 secret"),
      rsaPrivateKey: await this.resolveSecretRef(options.rsaPrivateKeyRef, "RSA 私钥"),
      seq: options.seq.toString(),
      limit: options.limit ?? Number(process.env.WECOM_MSGAUDIT_PULL_LIMIT ?? 100),
      chatId: options.chatId ?? null,
      syncFiles: options.syncFiles,
      storageDir
    });
    return this.normalizeAdapterPullResult(payload, options.seq);
  }

  buildDemoBatch(sourceId: string, today: string): WecomArchiveMessage[] {
    return [
      {
        msgId: `archive-${sourceId}-${today}-internal-1`,
        senderWecomUserId: "employee",
        senderName: "前端成员",
        senderType: "INTERNAL",
        sentAt: `${today}T09:40:00.000Z`,
        msgType: "TEXT",
        content: "今天完成 AI 工作日历附件归档联调，文件摘要已经能作为日报证据，剩余风险是客户验收材料格式不统一。",
        files: [
          {
            sdkFileId: `sdk-${sourceId}-${today}-acceptance-doc`,
            fileName: "客户验收问题清单.docx",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileSize: 186432,
            kind: CommunicationFileKind.FILE,
            downloadStatus: CommunicationFileDownloadStatus.DOWNLOADED,
            textContent: "客户验收问题清单：登录态、附件归档、风险跟进人、导出格式。",
            aiSummary: "验收文件列出登录态、附件归档、风险负责人和导出格式等待处理项。"
          }
        ]
      },
      {
        msgId: `archive-${sourceId}-${today}-external-1`,
        senderWecomUserId: "external_customer_a",
        senderName: "客户A联系人",
        senderType: "EXTERNAL",
        externalUserId: "external_customer_a",
        externalName: "客户A联系人",
        externalConsentStatus: WecomExternalConsentStatus.AGREED,
        sentAt: `${today}T10:10:00.000Z`,
        msgType: "TEXT",
        content: "客户反馈验收环境的导出按钮偶现失败，希望今天确认修复时间。"
      },
      {
        msgId: `archive-${sourceId}-${today}-external-denied`,
        senderWecomUserId: "external_denied_user",
        senderName: "未同意客户联系人",
        senderType: "EXTERNAL",
        externalUserId: "external_denied_user",
        externalName: "未同意客户联系人",
        externalConsentStatus: WecomExternalConsentStatus.DISAGREED,
        sentAt: `${today}T10:20:00.000Z`,
        msgType: "TEXT",
        content: "这条消息会被合规边界跳过，不进入分析。"
      }
    ];
  }

  private async ensureMediaStorageDir(tenantId: string) {
    const baseDir = process.env.WECOM_MSGAUDIT_MEDIA_DIR ?? join(process.cwd(), "tmp", "wecom-msgaudit-media");
    const dir = join(baseDir, tenantId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  private async resolveSecretRef(ref: string, label: string) {
    const value = ref.trim();
    if (!value) throw new BadRequestException(`${label} 不能为空`);
    if (value.startsWith("env:")) {
      const key = value.slice(4).trim();
      const secret = process.env[key];
      if (!secret) throw new BadRequestException(`${label} 环境变量 ${key} 未配置`);
      return secret;
    }
    if (value.startsWith("file:")) {
      const path = value.slice(5).trim();
      if (!path) throw new BadRequestException(`${label} 文件路径为空`);
      return readFile(path, "utf8");
    }
    return value;
  }

  private adapterArgs() {
    const raw = process.env.WECOM_MSGAUDIT_ADAPTER_ARGS?.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
    } catch {
      // Fall through to the explicit error below.
    }
    throw new BadRequestException("WECOM_MSGAUDIT_ADAPTER_ARGS 必须是 JSON 字符串数组");
  }

  private runOfficialAdapter(operation: AdapterOperation, payload: Record<string, unknown>) {
    const command = process.env.WECOM_MSGAUDIT_ADAPTER_CMD?.trim();
    if (!command) {
      throw new BadRequestException("正式企业微信同步需要配置 WECOM_MSGAUDIT_ADAPTER_CMD，并接入企业微信官方会话内容存档 SDK 适配器。");
    }
    const timeoutMs = Number(process.env.WECOM_MSGAUDIT_ADAPTER_TIMEOUT_MS ?? 120000);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = spawn(command, this.adapterArgs(), {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, WECOM_MSGAUDIT_OPERATION: operation }
      });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new BadRequestException("企业微信会话内容存档 SDK 适配器执行超时"));
      }, timeoutMs);

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new BadRequestException(`无法启动企业微信 SDK 适配器：${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new BadRequestException(`企业微信 SDK 适配器执行失败：${this.safeAdapterError(stderr || stdout)}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout || "{}");
          if (parsed && typeof parsed === "object" && "ok" in parsed && parsed.ok === false) {
            reject(new BadRequestException(`企业微信 SDK 适配器返回失败：${this.safeAdapterError(String(parsed.message ?? "未知错误"))}`));
            return;
          }
          resolve(parsed as Record<string, unknown>);
        } catch {
          reject(new BadRequestException("企业微信 SDK 适配器返回的不是有效 JSON"));
        }
      });
      child.stdin.end(JSON.stringify({ operation, ...payload }));
    });
  }

  private normalizeAdapterPullResult(payload: Record<string, unknown>, fallbackSeq: bigint): WecomArchivePullResult {
    const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
    const messages = rawMessages.map((item) => this.normalizeAdapterMessage(item)).filter(Boolean) as WecomArchiveMessage[];
    const nextSeqValue = payload.nextSeq ?? payload.seq ?? messages.at(-1)?.seq ?? fallbackSeq;
    const nextSeq = this.toBigInt(nextSeqValue, fallbackSeq);
    return {
      messages,
      nextSeq,
      rawCount: Number(payload.rawCount ?? rawMessages.length),
      hasMore: Boolean(payload.hasMore),
      provider: "official"
    };
  }

  private normalizeAdapterMessage(value: unknown): WecomArchiveMessage | null {
    if (!value || typeof value !== "object") return null;
    const item = value as Record<string, unknown>;
    const msgId = this.optionalString(item.msgId ?? item.msgid);
    if (!msgId) return null;
    const msgType = this.normalizeMessageType(this.optionalString(item.msgType ?? item.msgtype));
    return {
      msgId,
      seq: item.seq as string | number | bigint | undefined,
      chatId: this.optionalString(item.chatId ?? item.roomid ?? item.roomId),
      chatName: this.optionalString(item.chatName ?? item.roomName),
      senderWecomUserId: this.optionalString(item.senderWecomUserId ?? item.from),
      senderName: this.optionalString(item.senderName ?? item.fromName),
      senderType: item.senderType === "EXTERNAL" ? "EXTERNAL" : "INTERNAL",
      externalUserId: this.optionalString(item.externalUserId),
      externalName: this.optionalString(item.externalName),
      externalConsentStatus: this.normalizeConsentStatus(item.externalConsentStatus),
      content: this.optionalString(item.content ?? item.text),
      sentAt: this.optionalString(item.sentAt ?? item.msgtime),
      msgType,
      files: this.normalizeAdapterFiles(item.files)
    };
  }

  private normalizeAdapterFiles(value: unknown): WecomArchiveMessage["files"] {
    if (!Array.isArray(value)) return [];
    return value
      .map((file) => {
        if (!file || typeof file !== "object") return null;
        const item = file as Record<string, unknown>;
        const sdkFileId = this.optionalString(item.sdkFileId ?? item.sdkfileid);
        if (!sdkFileId) return null;
        return {
          sdkFileId,
          fileName: this.optionalString(item.fileName ?? item.filename),
          mimeType: this.optionalString(item.mimeType),
          fileSize: typeof item.fileSize === "number" ? item.fileSize : typeof item.filesize === "number" ? item.filesize : undefined,
          kind: this.normalizeFileKind(this.optionalString(item.kind)),
          downloadStatus: this.normalizeDownloadStatus(item.downloadStatus),
          storagePath: this.optionalString(item.storagePath),
          textContent: this.optionalString(item.textContent),
          aiSummary: this.optionalString(item.aiSummary),
          error: this.optionalString(item.error)
        };
      })
      .filter(Boolean) as NonNullable<WecomArchiveMessage["files"]>;
  }

  private normalizeMessageType(value?: string): WecomArchiveMessage["msgType"] {
    const normalized = value?.toUpperCase();
    if (normalized === "FILE" || normalized === "IMAGE" || normalized === "VOICE" || normalized === "LINK" || normalized === "OTHER") return normalized;
    return "TEXT";
  }

  private normalizeConsentStatus(value: unknown) {
    if (value === WecomExternalConsentStatus.AGREED || value === WecomExternalConsentStatus.DISAGREED || value === WecomExternalConsentStatus.REVOKED) return value;
    return WecomExternalConsentStatus.UNKNOWN;
  }

  private normalizeFileKind(value?: string) {
    const normalized = value?.toUpperCase();
    if (normalized === CommunicationFileKind.IMAGE || normalized === CommunicationFileKind.VOICE || normalized === CommunicationFileKind.VIDEO || normalized === CommunicationFileKind.LINK || normalized === CommunicationFileKind.OTHER) return normalized;
    return CommunicationFileKind.FILE;
  }

  private normalizeDownloadStatus(value: unknown) {
    if (
      value === CommunicationFileDownloadStatus.DOWNLOADED ||
      value === CommunicationFileDownloadStatus.DOWNLOADING ||
      value === CommunicationFileDownloadStatus.SKIPPED ||
      value === CommunicationFileDownloadStatus.FAILED
    ) {
      return value;
    }
    return CommunicationFileDownloadStatus.PENDING;
  }

  private optionalString(value: unknown) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
    return undefined;
  }

  private toBigInt(value: unknown, fallback: bigint) {
    try {
      if (typeof value === "bigint") return value;
      if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
      if (typeof value === "string" && value.trim()) return BigInt(value.trim());
    } catch {
      return fallback;
    }
    return fallback;
  }

  private safeAdapterError(value: string) {
    return value.replace(/(secret|privateKey|rsaPrivateKey|msgAuditSecret)[^,\n]*/gi, "$1=***").slice(0, 500) || "未知错误";
  }
}
