import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CommunicationFileDownloadStatus,
  CommunicationFileKind,
  CommunicationInsightStatus,
  CommunicationInsightType,
  CommunicationMessageType,
  CommunicationSenderType,
  CommunicationProjectSuggestionStatus,
  CommunicationSourceType,
  CommunicationSyncStatus,
  Prisma,
  WecomExternalConsentStatus,
  WecomIntegrationStatus,
  WecomUserMappingStatus,
  WorkLogStatus
} from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { AiQueueService } from "../ai/ai-queue.service";
import {
  ConfirmCommunicationDraftDto,
  ConfirmWecomBindingDto,
  SaveCommunicationSourceDto,
  SaveWecomIntegrationDto,
  SyncWecomArchiveDto,
  SyncWecomTextMessageDto,
  UpdateProjectSuggestionDto
} from "./dto/wecom.dto";
import { WecomMsgAuditWorker, type WecomArchiveMessage } from "./wecom-msgaudit.worker";

const attachmentPublicSelect = {
  id: true,
  workLogId: true,
  uploaderId: true,
  kind: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  aiSummary: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.WorkLogAttachmentSelect;

const workLogPublicInclude = {
  user: { include: { department: true } },
  project: true,
  aiAnalysis: true,
  attachments: {
    where: { deletedAt: null },
    select: attachmentPublicSelect,
    orderBy: [{ createdAt: "asc" as const }]
  },
  sourceLinks: {
    include: {
      source: true,
      message: true,
      file: true,
      insight: true
    },
    orderBy: [{ createdAt: "asc" as const }]
  }
} satisfies Prisma.WorkLogInclude;

function parseDateOnly(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Invalid date");
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((item) => item?.trim()).filter(Boolean) as string[]));
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function toCheckpointSeq(value: bigint | number | string | null | undefined) {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && value.trim()) return BigInt(value.trim());
  } catch {
    return 0n;
  }
  return 0n;
}

function clampText(value: string, limit: number) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed;
}

@Injectable()
export class WecomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly aiQueue: AiQueueService,
    private readonly msgAuditWorker: WecomMsgAuditWorker
  ) {}

  async overview(user: CurrentUser) {
    const [integrations, sources, bindings, drafts, files, projectSuggestions, externalConsents] = await Promise.all([
      this.prisma.wecomIntegration.findMany({
        where: { tenantId: user.tenantId, deletedAt: null },
        orderBy: [{ updatedAt: "desc" }]
      }),
      this.findVisibleSources(user),
      this.findVisibleBindings(user),
      this.findVisibleDrafts(user, 8),
      this.findVisibleFiles(user, 8),
      this.findVisibleProjectSuggestions(user, 8),
      this.access.isCompanyAdmin(user)
        ? this.prisma.wecomExternalContactConsent.findMany({
            where: { tenantId: user.tenantId },
            orderBy: [{ updatedAt: "desc" }],
            take: 8
          })
        : Promise.resolve([])
    ]);
    await this.writeAudit(user, "WECOM_OVERVIEW_VIEWED", "WecomIntegration", integrations[0]?.id);

    const mappingSummary = bindings.reduce(
      (summary, item) => {
        summary.total += 1;
        summary[item.mappingStatus] = (summary[item.mappingStatus] ?? 0) + 1;
        return summary;
      },
      {
        total: 0,
        AUTO: 0,
        CONFIRMED: 0,
        CONFLICT: 0,
        UNMAPPED: 0,
        EXTERNAL: 0
      } as Record<WecomUserMappingStatus | "total", number>
    );

    const activeIntegration = integrations.find((item) => item.status === WecomIntegrationStatus.ACTIVE) ?? integrations[0] ?? null;
    return {
      integrations,
      activeIntegration,
      workerRuntime: this.msgAuditWorker.getRuntimeStatus(),
      sources,
      bindings,
      files,
      projectSuggestions,
      externalConsents,
      mappingSummary,
      drafts,
      setupSummary: {
        autoMatched: mappingSummary.AUTO + mappingSummary.CONFIRMED,
        needsConfirmation: mappingSummary.CONFLICT + mappingSummary.UNMAPPED,
        externalContacts: mappingSummary.EXTERNAL,
        chatCount: sources.length,
        suggestedProjectGroups: sources.filter((item) => item.sourceType === CommunicationSourceType.PROJECT).length,
        pendingProjectSuggestions: projectSuggestions.filter((item) => item.status === CommunicationProjectSuggestionStatus.PENDING).length,
        fileCount: files.length,
        failedFileCount: files.filter((item) => item.downloadStatus === CommunicationFileDownloadStatus.FAILED).length,
        externalConsentIssues: externalConsents.filter((item) => item.status !== WecomExternalConsentStatus.AGREED).length,
        pendingDrafts: drafts.length,
        lastSyncAt: activeIntegration?.lastSyncAt ?? null,
        syncStatus: activeIntegration?.lastSyncStatus ?? CommunicationSyncStatus.PENDING
      }
    };
  }

  async saveIntegration(user: CurrentUser, dto: SaveWecomIntegrationDto) {
    this.assertCanManageWecom(user);
    const status = dto.rsaPublicKeyConfigured ? WecomIntegrationStatus.ACTIVE : WecomIntegrationStatus.DRAFT;
    const integration = await this.prisma.wecomIntegration.upsert({
      where: { tenantId_corpId: { tenantId: user.tenantId, corpId: dto.corpId } },
      update: {
        msgAuditSecretRef: dto.msgAuditSecretRef,
        rsaPrivateKeyRef: dto.rsaPrivateKeyRef,
        rsaPublicKeyConfigured: dto.rsaPublicKeyConfigured,
        trustedIpNote: dto.trustedIpNote ?? null,
        mode: dto.mode,
        status,
        syncDepartmentIds: unique(dto.syncDepartmentIds ?? []),
        syncUserIds: unique(dto.syncUserIds ?? []),
        syncChatIds: unique(dto.syncChatIds ?? []),
        syncFiles: dto.syncFiles,
        generateLogDrafts: dto.generateLogDrafts,
        generateProjectRisks: dto.generateProjectRisks,
        retentionDays: dto.retentionDays,
        lastError: null
      },
      create: {
        tenantId: user.tenantId,
        corpId: dto.corpId,
        msgAuditSecretRef: dto.msgAuditSecretRef,
        rsaPrivateKeyRef: dto.rsaPrivateKeyRef,
        rsaPublicKeyConfigured: dto.rsaPublicKeyConfigured,
        trustedIpNote: dto.trustedIpNote ?? null,
        mode: dto.mode,
        status,
        syncDepartmentIds: unique(dto.syncDepartmentIds ?? []),
        syncUserIds: unique(dto.syncUserIds ?? []),
        syncChatIds: unique(dto.syncChatIds ?? []),
        syncFiles: dto.syncFiles,
        generateLogDrafts: dto.generateLogDrafts,
        generateProjectRisks: dto.generateProjectRisks,
        retentionDays: dto.retentionDays
      }
    });
    await this.prisma.wecomSyncCheckpoint.upsert({
      where: { tenantId_integrationId: { tenantId: user.tenantId, integrationId: integration.id } },
      update: {},
      create: {
        tenantId: user.tenantId,
        integrationId: integration.id
      }
    });
    await this.writeAudit(user, "WECOM_INTEGRATION_SAVED", "WecomIntegration", integration.id, {
      corpId: integration.corpId,
      mode: integration.mode,
      syncFiles: integration.syncFiles,
      generateLogDrafts: integration.generateLogDrafts,
      generateProjectRisks: integration.generateProjectRisks
    });
    return integration;
  }

  async testIntegration(user: CurrentUser) {
    this.assertCanManageWecom(user);
    const integration = await this.getActiveOrLatestIntegration(user.tenantId);
    const missing = [
      integration.corpId ? null : "corpid",
      integration.msgAuditSecretRef ? null : "会话内容存档 secret",
      integration.rsaPrivateKeyRef ? null : "RSA 私钥或密钥引用",
      integration.rsaPublicKeyConfigured ? null : "企业微信后台 RSA 公钥"
    ].filter(Boolean);
    if (missing.length) {
      const updated = await this.prisma.wecomIntegration.update({
        where: { id: integration.id },
        data: {
          status: WecomIntegrationStatus.ERROR,
          lastSyncStatus: CommunicationSyncStatus.ERROR,
          lastError: `缺少配置：${missing.join("、")}`
        }
      });
      await this.writeAudit(user, "WECOM_INTEGRATION_TESTED", "WecomIntegration", integration.id, {
        ok: false,
        missing
      });
      return {
        ok: false,
        integration: updated,
        workerRuntime: this.msgAuditWorker.getRuntimeStatus(),
        message: `请先补充：${missing.join("、")}`
      };
    }

    try {
      const workerResult = await this.msgAuditWorker.testConnection({
        tenantId: user.tenantId,
        integrationId: integration.id,
        corpId: integration.corpId,
        msgAuditSecretRef: integration.msgAuditSecretRef,
        rsaPrivateKeyRef: integration.rsaPrivateKeyRef
      });
      const updated = await this.prisma.wecomIntegration.update({
        where: { id: integration.id },
        data: {
          status: WecomIntegrationStatus.ACTIVE,
          lastSyncStatus: CommunicationSyncStatus.PENDING,
          lastError: null
        }
      });
      await this.writeAudit(user, "WECOM_INTEGRATION_TESTED", "WecomIntegration", integration.id, {
        ok: true,
        provider: workerResult.provider
      });
      return {
        ok: true,
        integration: updated,
        workerRuntime: this.msgAuditWorker.getRuntimeStatus(),
        message:
          workerResult.provider === "official"
            ? "企业微信会话内容存档 SDK 适配器可用，可以按 seq 增量同步真实消息。"
            : workerResult.message
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "企业微信会话内容存档连接测试失败";
      const updated = await this.prisma.wecomIntegration.update({
        where: { id: integration.id },
        data: {
          status: WecomIntegrationStatus.ERROR,
          lastSyncStatus: CommunicationSyncStatus.ERROR,
          lastError: message
        }
      });
      await this.writeAudit(user, "WECOM_INTEGRATION_TESTED", "WecomIntegration", integration.id, {
        ok: false,
        message
      });
      return {
        ok: false,
        integration: updated,
        workerRuntime: this.msgAuditWorker.getRuntimeStatus(),
        message
      };
    }
  }

  async autoMatchMembers(user: CurrentUser) {
    this.assertCanManageWecom(user);
    const integration = await this.getActiveOrLatestIntegration(user.tenantId);
    const members = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      include: { department: true }
    });
    const createdOrUpdated = [];
    for (const member of members) {
      const wecomUserId = this.memberWecomUserId(member);
      const existing = await this.prisma.wecomUserBinding.findUnique({
        where: { tenantId_wecomCorpId_wecomUserId: { tenantId: user.tenantId, wecomCorpId: integration.corpId, wecomUserId } }
      });
      const mappingStatus = existing?.mappingStatus === WecomUserMappingStatus.CONFIRMED ? WecomUserMappingStatus.CONFIRMED : WecomUserMappingStatus.AUTO;
      const confidence = member.phone ? 0.98 : member.email ? 0.94 : 0.76;
      const binding = await this.prisma.wecomUserBinding.upsert({
        where: { tenantId_wecomCorpId_wecomUserId: { tenantId: user.tenantId, wecomCorpId: integration.corpId, wecomUserId } },
        update: {
          userId: member.id,
          wecomName: member.name,
          mobile: member.phone,
          email: member.email,
          departmentIds: member.departmentId ? [member.departmentId] : [],
          mappingStatus,
          confidence
        },
        create: {
          tenantId: user.tenantId,
          userId: member.id,
          wecomCorpId: integration.corpId,
          wecomUserId,
          wecomName: member.name,
          mobile: member.phone,
          email: member.email,
          departmentIds: member.departmentId ? [member.departmentId] : [],
          mappingStatus,
          confidence
        }
      });
      createdOrUpdated.push(binding);
    }
    await this.ensureDemoExceptionBindings(user.tenantId, integration.corpId);
    const bindings = await this.findVisibleBindings(user);
    await this.writeAudit(user, "WECOM_MEMBER_AUTO_MATCHED", "WecomIntegration", integration.id, {
      matched: createdOrUpdated.length,
      corpId: integration.corpId
    });
    return {
      matched: createdOrUpdated.length,
      needsConfirmation: bindings.filter((item) => item.mappingStatus === WecomUserMappingStatus.CONFLICT || item.mappingStatus === WecomUserMappingStatus.UNMAPPED).length,
      externalContacts: bindings.filter((item) => item.mappingStatus === WecomUserMappingStatus.EXTERNAL).length,
      bindings
    };
  }

  async listBindings(user: CurrentUser) {
    const bindings = await this.findVisibleBindings(user);
    await this.writeAudit(user, "WECOM_BINDINGS_VIEWED", "WecomUserBinding");
    return bindings;
  }

  async updateBinding(user: CurrentUser, id: string, dto: ConfirmWecomBindingDto) {
    this.assertCanManageWecom(user);
    const existing = await this.prisma.wecomUserBinding.findFirst({
      where: { id, tenantId: user.tenantId }
    });
    if (!existing) {
      throw new NotFoundException("企业微信成员映射不存在");
    }
    let targetUserId: string | null = dto.userId ?? null;
    if (dto.mappingStatus === WecomUserMappingStatus.CONFIRMED && !targetUserId) {
      throw new BadRequestException("确认映射时必须选择系统成员");
    }
    if (targetUserId) {
      const target = await this.prisma.user.findFirst({
        where: { id: targetUserId, tenantId: user.tenantId, deletedAt: null },
        select: { id: true }
      });
      if (!target) {
        throw new NotFoundException("系统成员不存在");
      }
    }
    if (dto.mappingStatus === WecomUserMappingStatus.EXTERNAL || dto.mappingStatus === WecomUserMappingStatus.UNMAPPED) {
      targetUserId = null;
    }
    const binding = await this.prisma.wecomUserBinding.update({
      where: { id },
      data: {
        userId: targetUserId,
        mappingStatus: dto.mappingStatus,
        confidence: dto.mappingStatus === WecomUserMappingStatus.CONFIRMED ? 1 : existing.confidence
      },
      include: { user: { include: { department: true } } }
    });
    await this.writeAudit(user, "WECOM_MEMBER_MAPPING_UPDATED", "WecomUserBinding", id, {
      wecomUserId: binding.wecomUserId,
      mappingStatus: binding.mappingStatus,
      userId: binding.userId
    });
    return binding;
  }

  async listSources(user: CurrentUser) {
    const sources = await this.findVisibleSources(user);
    await this.writeAudit(user, "COMMUNICATION_SOURCES_VIEWED", "CommunicationSource");
    return sources;
  }

  async saveSource(user: CurrentUser, dto: SaveCommunicationSourceDto) {
    this.assertCanManageWecom(user);
    const integration = await this.getActiveOrLatestIntegration(user.tenantId);
    await this.assertSourceReferences(user.tenantId, dto);
    const payload = this.sourcePayload(dto);
    const source = await this.prisma.communicationSource.upsert({
      where: { tenantId_chatId: { tenantId: user.tenantId, chatId: dto.chatId } },
      update: {
        ...payload,
        integrationId: integration.id
      },
      create: {
        tenantId: user.tenantId,
        integrationId: integration.id,
        ...payload
      }
    });
    await this.writeAudit(user, "COMMUNICATION_SOURCE_SAVED", "CommunicationSource", source.id, {
      chatId: source.chatId,
      sourceType: source.sourceType,
      projectIds: source.projectIds,
      departmentIds: source.departmentIds
    });
    return source;
  }

  async updateSource(user: CurrentUser, id: string, dto: SaveCommunicationSourceDto) {
    this.assertCanManageWecom(user);
    const existing = await this.prisma.communicationSource.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null }
    });
    if (!existing) {
      throw new NotFoundException("沟通来源不存在");
    }
    await this.assertSourceReferences(user.tenantId, dto);
    const source = await this.prisma.communicationSource.update({
      where: { id },
      data: this.sourcePayload(dto)
    });
    await this.writeAudit(user, "COMMUNICATION_SOURCE_UPDATED", "CommunicationSource", source.id, {
      chatId: source.chatId,
      sourceType: source.sourceType,
      projectIds: source.projectIds,
      departmentIds: source.departmentIds
    });
    return source;
  }

  async syncTextMessages(user: CurrentUser, dto: SyncWecomTextMessageDto) {
    this.assertCanManageWecom(user);
    const integration = await this.getActiveOrLatestIntegration(user.tenantId);
    const source = dto.sourceId ? await this.getSource(user.tenantId, dto.sourceId) : await this.ensureDefaultSource(user.tenantId, integration.id);
    const inputMessages = dto.items?.length ? dto.items : await this.demoTextMessages(user.tenantId, integration.corpId, source.id);
    const newMessages = [];
    for (const input of inputMessages) {
      const content = input.content?.trim();
      if (!content) continue;
      const senderWecomUserId = input.senderWecomUserId?.trim() || "unknown";
      const binding = await this.prisma.wecomUserBinding.findUnique({
        where: {
          tenantId_wecomCorpId_wecomUserId: {
            tenantId: user.tenantId,
            wecomCorpId: integration.corpId,
            wecomUserId: senderWecomUserId
          }
        }
      });
      const senderType = binding?.mappingStatus === WecomUserMappingStatus.EXTERNAL ? CommunicationSenderType.EXTERNAL : CommunicationSenderType.INTERNAL;
      const mappingStatus = binding?.mappingStatus ?? WecomUserMappingStatus.UNMAPPED;
      const mappedUserId = mappingStatus === WecomUserMappingStatus.AUTO || mappingStatus === WecomUserMappingStatus.CONFIRMED ? binding?.userId ?? null : null;
      const msgId = input.msgId || `wecom-${source.chatId}-${senderWecomUserId}-${new Date(input.sentAt ?? Date.now()).getTime()}`;
      const existing = await this.prisma.communicationMessage.findUnique({
        where: { tenantId_msgId: { tenantId: user.tenantId, msgId } }
      });
      if (existing) {
        continue;
      }
      const message = await this.prisma.communicationMessage.create({
        data: {
          tenantId: user.tenantId,
          integrationId: integration.id,
          sourceId: source.id,
          msgId,
          senderWecomUserId,
          senderName: input.senderName ?? binding?.wecomName ?? senderWecomUserId,
          senderType,
          mappedUserId,
          mappingStatus,
          content,
          msgType: CommunicationMessageType.TEXT,
          sentAt: new Date(input.sentAt ?? Date.now()),
          rawPayloadEncryptedRef: "wecom-msgaudit-worker://encrypted-payload"
        }
      });
      newMessages.push(message);
    }
    const insights = await this.generateDraftInsights(user.tenantId, source.id, newMessages);
    await this.generateProjectSuggestions(user.tenantId, source.id);
    await this.refreshSourceCounters(source.id);
    await this.prisma.wecomIntegration.update({
      where: { id: integration.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: CommunicationSyncStatus.OK,
        lastError: null
      }
    });
    await this.writeAudit(user, "WECOM_TEXT_MESSAGES_SYNCED", "CommunicationSource", source.id, {
      sourceId: source.id,
      messages: newMessages.length,
      insights: insights.length
    });
    return {
      messages: newMessages.length,
      insights,
      skipped: inputMessages.length - newMessages.length
    };
  }

  async syncArchive(user: CurrentUser, dto: SyncWecomArchiveDto) {
    this.assertCanManageWecom(user);
    const integration = await this.getActiveOrLatestIntegration(user.tenantId);
    const requestedSource = dto.sourceId ? await this.getSource(user.tenantId, dto.sourceId) : null;
    const checkpoint = await this.prisma.wecomSyncCheckpoint.upsert({
      where: { tenantId_integrationId: { tenantId: user.tenantId, integrationId: integration.id } },
      update: { status: CommunicationSyncStatus.SYNCING, lastError: null },
      create: {
        tenantId: user.tenantId,
        integrationId: integration.id,
        status: CommunicationSyncStatus.SYNCING
      }
    });
    await this.prisma.wecomIntegration.update({
      where: { id: integration.id },
      data: { lastSyncStatus: CommunicationSyncStatus.SYNCING, lastError: null }
    });
    if (requestedSource) {
      await this.prisma.communicationSource.update({
        where: { id: requestedSource.id },
        data: { lastSyncStatus: CommunicationSyncStatus.SYNCING, lastError: null }
      });
    }

    try {
      const manualMessages = dto.messages?.length ? dto.messages : null;
      if (manualMessages && this.msgAuditWorker.getMode() === "official" && process.env.WECOM_MSGAUDIT_ALLOW_MANUAL_MESSAGES !== "true") {
        throw new BadRequestException("正式企业微信模式不允许通过接口注入消息，请使用企业微信会话内容存档 SDK 增量同步。");
      }

      const archiveResult = manualMessages
        ? {
            messages: manualMessages,
            nextSeq: checkpoint.seq,
            rawCount: manualMessages.length,
            hasMore: false,
            provider: "mock" as const
          }
        : await this.msgAuditWorker.pullArchive({
            tenantId: user.tenantId,
            integrationId: integration.id,
            corpId: integration.corpId,
            msgAuditSecretRef: integration.msgAuditSecretRef,
            rsaPrivateKeyRef: integration.rsaPrivateKeyRef,
            sourceId: requestedSource?.id,
            chatId: requestedSource?.chatId,
            seq: checkpoint.seq,
            limit: dto.limit,
            syncFiles: integration.syncFiles || Boolean(requestedSource?.syncFiles)
          });

      const grouped = await this.groupArchiveMessagesBySource(user.tenantId, integration.id, archiveResult.messages, requestedSource);
      let messageCount = 0;
      let fileCount = 0;
      let skippedExternal = 0;
      const insights = [];
      const suggestions = [];
      const sourceIds = [];
      for (const group of grouped) {
        const persisted = await this.persistArchiveBatch(user.tenantId, integration.id, integration.corpId, group.source.id, group.messages);
        messageCount += persisted.messages.length;
        fileCount += persisted.files.length;
        skippedExternal += persisted.skippedExternal;
        insights.push(...(await this.generateDraftInsights(user.tenantId, group.source.id, persisted.messages)));
        suggestions.push(...(await this.generateProjectSuggestions(user.tenantId, group.source.id)));
        sourceIds.push(group.source.id);
        await this.refreshSourceCounters(group.source.id);
        await this.prisma.communicationSource.update({
          where: { id: group.source.id },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: CommunicationSyncStatus.OK,
            lastError: null
          }
        });
      }

      await this.prisma.wecomSyncCheckpoint.update({
        where: { id: checkpoint.id },
        data: {
          seq: archiveResult.nextSeq,
          status: CommunicationSyncStatus.OK,
          lastSyncedAt: new Date(),
          lastError: null
        }
      });
      await this.prisma.wecomIntegration.update({
        where: { id: integration.id },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: CommunicationSyncStatus.OK,
          lastError: null
        }
      });
      await this.writeAudit(user, "WECOM_ARCHIVE_SYNCED", "WecomIntegration", integration.id, {
        sourceIds,
        messages: messageCount,
        files: fileCount,
        insights: insights.length,
        suggestions: suggestions.length,
        skippedExternal,
        provider: archiveResult.provider,
        nextSeq: archiveResult.nextSeq.toString(),
        rawCount: archiveResult.rawCount
      });
      return {
        messages: messageCount,
        files: fileCount,
        skippedExternal,
        insights,
        projectSuggestions: suggestions,
        sourceIds,
        provider: archiveResult.provider,
        nextSeq: archiveResult.nextSeq.toString(),
        hasMore: archiveResult.hasMore
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "企业微信会话内容存档同步失败";
      await this.prisma.wecomSyncCheckpoint.update({
        where: { id: checkpoint.id },
        data: { status: CommunicationSyncStatus.ERROR, lastError: message }
      });
      await this.prisma.wecomIntegration.update({
        where: { id: integration.id },
        data: { lastSyncStatus: CommunicationSyncStatus.ERROR, lastError: message }
      });
      if (requestedSource) {
        await this.prisma.communicationSource.update({
          where: { id: requestedSource.id },
          data: { lastSyncStatus: CommunicationSyncStatus.ERROR, lastError: message }
        });
      }
      await this.writeAudit(user, "WECOM_ARCHIVE_SYNC_FAILED", "WecomIntegration", integration.id, {
        sourceId: requestedSource?.id,
        message
      });
      throw error;
    }
  }

  async listFiles(user: CurrentUser) {
    const files = await this.findVisibleFiles(user, 50);
    await this.writeAudit(user, "COMMUNICATION_FILES_VIEWED", "CommunicationFile");
    return files;
  }

  async listProjectSuggestions(user: CurrentUser) {
    const suggestions = await this.findVisibleProjectSuggestions(user, 50);
    await this.writeAudit(user, "COMMUNICATION_PROJECT_SUGGESTIONS_VIEWED", "CommunicationProjectSuggestion");
    return suggestions;
  }

  async updateProjectSuggestion(user: CurrentUser, id: string, dto: UpdateProjectSuggestionDto) {
    this.assertCanManageWecom(user);
    const suggestion = await this.prisma.communicationProjectSuggestion.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { source: true, project: true }
    });
    if (!suggestion) {
      throw new NotFoundException("项目群建议不存在");
    }
    const updated = await this.prisma.communicationProjectSuggestion.update({
      where: { id },
      data: {
        status: dto.status,
        confirmedAt: dto.status === CommunicationProjectSuggestionStatus.CONFIRMED ? new Date() : suggestion.confirmedAt,
        rejectedAt: dto.status === CommunicationProjectSuggestionStatus.REJECTED ? new Date() : suggestion.rejectedAt
      },
      include: { source: true, project: true }
    });
    if (dto.status === CommunicationProjectSuggestionStatus.CONFIRMED) {
      const projectIds = unique([...suggestion.source.projectIds, suggestion.projectId]);
      await this.prisma.communicationSource.update({
        where: { id: suggestion.sourceId },
        data: {
          sourceType: CommunicationSourceType.PROJECT,
          projectIds
        }
      });
    }
    await this.writeAudit(user, "COMMUNICATION_PROJECT_SUGGESTION_UPDATED", "CommunicationProjectSuggestion", id, {
      status: dto.status,
      sourceId: suggestion.sourceId,
      projectId: suggestion.projectId
    });
    return updated;
  }

  async listLogDrafts(user: CurrentUser) {
    const drafts = await this.findVisibleDrafts(user, 50);
    await this.writeAudit(user, "COMMUNICATION_LOG_DRAFTS_VIEWED", "CommunicationInsight");
    return drafts;
  }

  async confirmDraft(user: CurrentUser, id: string, dto: ConfirmCommunicationDraftDto) {
    const insight = await this.getVisibleDraft(user, id);
    if (!insight.suggestedUserId) {
      throw new BadRequestException("成员映射未确认，不能生成个人日报");
    }
    await this.assertProjectInTenant(user.tenantId, dto.projectId ?? null);
    const owner = await this.prisma.user.findFirstOrThrow({
      where: { id: insight.suggestedUserId, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, departmentId: true }
    });
    this.access.assertCanAccessUser(user, owner);
    const status = dto.submit === false ? WorkLogStatus.DRAFT : WorkLogStatus.SUBMITTED;
    const workLog = await this.prisma.workLog.create({
      data: {
        tenantId: user.tenantId,
        userId: owner.id,
        projectId: dto.projectId || null,
        date: parseDateOnly(dto.date),
        title: dto.title,
        content: dto.content,
        hours: String(dto.hours ?? insight.hours ?? 0),
        status,
        submittedAt: status === WorkLogStatus.SUBMITTED ? new Date() : null
      },
      include: workLogPublicInclude
    });
    const messageIds = safeArray(insight.sourceMessageIds);
    if (messageIds.length) {
      const messages = await this.prisma.communicationMessage.findMany({
        where: { id: { in: messageIds }, tenantId: user.tenantId },
        select: { id: true, sourceId: true, content: true }
      });
      await this.prisma.workLogSourceLink.createMany({
        data: messages.map((message) => ({
          tenantId: user.tenantId,
          workLogId: workLog.id,
          insightId: insight.id,
          messageId: message.id,
          sourceId: message.sourceId,
          evidenceSummary: clampText(message.content, 220)
        }))
      });
    } else {
      await this.prisma.workLogSourceLink.create({
        data: {
          tenantId: user.tenantId,
          workLogId: workLog.id,
          insightId: insight.id,
          sourceId: insight.sourceId,
          evidenceSummary: "来自企业微信沟通候选草稿。"
        }
      });
    }
    const fileIds = safeArray(insight.sourceFileIds);
    if (fileIds.length) {
      const files = await this.prisma.communicationFile.findMany({
        where: { id: { in: fileIds }, tenantId: user.tenantId },
        select: { id: true, sourceId: true, fileName: true, aiSummary: true }
      });
      await this.prisma.workLogSourceLink.createMany({
        data: files.map((file) => ({
          tenantId: user.tenantId,
          workLogId: workLog.id,
          insightId: insight.id,
          fileId: file.id,
          sourceId: file.sourceId,
          evidenceSummary: file.aiSummary ?? `来源文件：${file.fileName}`
        }))
      });
    }
    await this.prisma.communicationInsight.update({
      where: { id: insight.id },
      data: {
        status: CommunicationInsightStatus.CONFIRMED,
        confirmedWorkLogId: workLog.id
      }
    });
    if (insight.sourceId) {
      await this.refreshSourceCounters(insight.sourceId);
    }
    if (status === WorkLogStatus.SUBMITTED) {
      await this.aiQueue.enqueueWorkLogAnalysis(user.tenantId, workLog.id, user.id);
    }
    await this.writeAudit(user, "COMMUNICATION_LOG_DRAFT_CONFIRMED", "CommunicationInsight", insight.id, {
      workLogId: workLog.id,
      submit: status === WorkLogStatus.SUBMITTED,
      suggestedUserId: owner.id,
      sourceMessageCount: messageIds.length
    });
    return this.prisma.workLog.findFirstOrThrow({
      where: { id: workLog.id, tenantId: user.tenantId },
      include: workLogPublicInclude
    });
  }

  async ignoreDraft(user: CurrentUser, id: string) {
    const insight = await this.getVisibleDraft(user, id);
    const updated = await this.prisma.communicationInsight.update({
      where: { id: insight.id },
      data: { status: CommunicationInsightStatus.IGNORED }
    });
    if (updated.sourceId) {
      await this.refreshSourceCounters(updated.sourceId);
    }
    await this.writeAudit(user, "COMMUNICATION_LOG_DRAFT_IGNORED", "CommunicationInsight", insight.id);
    return { ok: true };
  }

  private async groupArchiveMessagesBySource(
    tenantId: string,
    integrationId: string,
    inputMessages: WecomArchiveMessage[],
    requestedSource: { id: string; chatId: string; name: string } | null
  ) {
    const defaultSource = requestedSource ?? (await this.ensureDefaultSource(tenantId, integrationId));
    const groups = new Map<string, { source: typeof defaultSource; messages: WecomArchiveMessage[] }>();
    for (const message of inputMessages) {
      const chatId = message.chatId?.trim();
      const source = requestedSource ?? (chatId ? await this.ensureSourceForArchiveChat(tenantId, integrationId, chatId, message.chatName) : defaultSource);
      const existing = groups.get(source.id);
      const normalizedMessage = {
        ...message,
        chatId: message.chatId ?? source.chatId,
        chatName: message.chatName ?? source.name
      };
      if (existing) {
        existing.messages.push(normalizedMessage);
      } else {
        groups.set(source.id, { source, messages: [normalizedMessage] });
      }
    }
    return Array.from(groups.values());
  }

  private async ensureSourceForArchiveChat(tenantId: string, integrationId: string, chatId: string, chatName?: string) {
    const existing = await this.prisma.communicationSource.findUnique({
      where: { tenantId_chatId: { tenantId, chatId } }
    });
    if (existing && !existing.deletedAt) return existing;
    const name = chatName?.trim() || `企业微信群 ${chatId.slice(0, 12)}`;
    return this.prisma.communicationSource.upsert({
      where: { tenantId_chatId: { tenantId, chatId } },
      update: {
        integrationId,
        name,
        deletedAt: null,
        lastSyncStatus: CommunicationSyncStatus.PENDING
      },
      create: {
        tenantId,
        integrationId,
        name,
        chatId,
        sourceType: CommunicationSourceType.GENERAL,
        projectIds: [],
        departmentIds: [],
        memberScopeUserIds: [],
        generateLogDrafts: true,
        generateProjectRisks: true,
        syncFiles: true,
        retentionDays: 180,
        lastSyncStatus: CommunicationSyncStatus.PENDING
      }
    });
  }

  private async persistArchiveBatch(
    tenantId: string,
    integrationId: string,
    corpId: string,
    sourceId: string,
    inputMessages: WecomArchiveMessage[]
  ) {
    const messages = [];
    const files = [];
    let skippedExternal = 0;
    for (const input of inputMessages) {
      const senderType = input.senderType === "EXTERNAL" ? CommunicationSenderType.EXTERNAL : CommunicationSenderType.INTERNAL;
      const externalConsentStatus = input.externalConsentStatus ?? WecomExternalConsentStatus.UNKNOWN;
      if (senderType === CommunicationSenderType.EXTERNAL && input.externalUserId) {
        await this.prisma.wecomExternalContactConsent.upsert({
          where: { tenantId_wecomCorpId_externalUserId: { tenantId, wecomCorpId: corpId, externalUserId: input.externalUserId } },
          update: {
            externalName: input.externalName ?? input.senderName ?? null,
            status: externalConsentStatus,
            agreedAt: externalConsentStatus === WecomExternalConsentStatus.AGREED ? new Date() : undefined,
            revokedAt:
              externalConsentStatus === WecomExternalConsentStatus.DISAGREED || externalConsentStatus === WecomExternalConsentStatus.REVOKED
                ? new Date()
                : undefined,
            lastCheckedAt: new Date()
          },
          create: {
            tenantId,
            wecomCorpId: corpId,
            externalUserId: input.externalUserId,
            externalName: input.externalName ?? input.senderName ?? null,
            status: externalConsentStatus,
            agreedAt: externalConsentStatus === WecomExternalConsentStatus.AGREED ? new Date() : null,
            revokedAt:
              externalConsentStatus === WecomExternalConsentStatus.DISAGREED || externalConsentStatus === WecomExternalConsentStatus.REVOKED
                ? new Date()
                : null,
            lastCheckedAt: new Date()
          }
        });
        if (externalConsentStatus !== WecomExternalConsentStatus.AGREED) {
          skippedExternal += 1;
          continue;
        }
      }
      const senderWecomUserId = input.senderWecomUserId?.trim() || input.externalUserId || "unknown";
      const binding =
        senderType === CommunicationSenderType.INTERNAL
          ? await this.prisma.wecomUserBinding.findUnique({
              where: {
                tenantId_wecomCorpId_wecomUserId: {
                  tenantId,
                  wecomCorpId: corpId,
                  wecomUserId: senderWecomUserId
                }
              }
            })
          : null;
      const mappingStatus = senderType === CommunicationSenderType.EXTERNAL ? WecomUserMappingStatus.EXTERNAL : binding?.mappingStatus ?? WecomUserMappingStatus.UNMAPPED;
      const mappedUserId = mappingStatus === WecomUserMappingStatus.AUTO || mappingStatus === WecomUserMappingStatus.CONFIRMED ? binding?.userId ?? null : null;
      const msgId = input.msgId || `wecom-archive-${sourceId}-${senderWecomUserId}-${new Date(input.sentAt ?? Date.now()).getTime()}`;
      let message = await this.prisma.communicationMessage.findUnique({
        where: { tenantId_msgId: { tenantId, msgId } }
      });
      if (!message) {
        message = await this.prisma.communicationMessage.create({
          data: {
            tenantId,
            integrationId,
            sourceId,
            msgId,
            senderWecomUserId,
            senderName: input.senderName ?? binding?.wecomName ?? senderWecomUserId,
            senderType,
            mappedUserId,
            mappingStatus,
            content: input.content?.trim() || this.fileMessageContent(input.files ?? []),
            msgType: this.messageType(input.msgType),
            sentAt: new Date(input.sentAt ?? Date.now()),
            rawPayloadEncryptedRef: `wecom-msgaudit-worker://message/${msgId}${input.seq ? `?seq=${input.seq.toString()}` : ""}`
          }
        });
        messages.push(message);
      }
      for (const fileInput of input.files ?? []) {
        const sdkFileId = fileInput.sdkFileId?.trim();
        if (!sdkFileId) continue;
        const existingFile = await this.prisma.communicationFile.findUnique({
          where: { tenantId_sdkFileId: { tenantId, sdkFileId } }
        });
        if (existingFile) {
          continue;
        }
        const file = await this.prisma.communicationFile.create({
          data: {
            tenantId,
            sourceId,
            messageId: message.id,
            sdkFileId,
            fileName: fileInput.fileName?.trim() || "企业微信文件",
            mimeType: fileInput.mimeType ?? null,
            fileSize: fileInput.fileSize ?? null,
            kind: fileInput.kind ?? this.fileKind(fileInput.mimeType, fileInput.fileName),
            downloadStatus: fileInput.downloadStatus ?? CommunicationFileDownloadStatus.PENDING,
            storagePath:
              fileInput.storagePath ??
              (fileInput.downloadStatus === CommunicationFileDownloadStatus.DOWNLOADED ? `wecom-msgaudit-worker://${sdkFileId}` : null),
            textContent: fileInput.textContent ?? null,
            aiSummary: fileInput.aiSummary ?? this.summarizeFile(fileInput.fileName, fileInput.mimeType, fileInput.fileSize, fileInput.textContent),
            uploadedByWecomUserId: senderWecomUserId,
            mappedUserId,
            externalUserId: input.externalUserId ?? null,
            consentStatus: senderType === CommunicationSenderType.EXTERNAL ? externalConsentStatus : WecomExternalConsentStatus.UNKNOWN,
            error: fileInput.error ?? null,
            sentAt: new Date(input.sentAt ?? Date.now())
          }
        });
        files.push(file);
      }
    }
    return { messages, files, skippedExternal };
  }

  private async findVisibleFiles(user: CurrentUser, take: number) {
    const sourceIds = (await this.findVisibleSources(user)).map((item) => item.id);
    const base: Prisma.CommunicationFileWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null
    };
    const where = this.access.isCompanyAdmin(user)
      ? base
      : {
          ...base,
          OR: [
            { sourceId: { in: sourceIds } },
            { mappedUserId: user.id },
            ...(this.access.isDepartmentManager(user)
              ? [
                  {
                    mappedUser: {
                      departmentId: user.departmentId ?? "__no_department__"
                    }
                  }
                ]
              : [])
          ]
        };
    return this.prisma.communicationFile.findMany({
      where,
      include: {
        source: true,
        message: true,
        mappedUser: { include: { department: true } }
      },
      orderBy: [{ sentAt: "desc" }],
      take
    });
  }

  private async findVisibleProjectSuggestions(user: CurrentUser, take: number) {
    const sourceIds = (await this.findVisibleSources(user)).map((item) => item.id);
    const where: Prisma.CommunicationProjectSuggestionWhereInput = this.access.isCompanyAdmin(user)
      ? { tenantId: user.tenantId }
      : { tenantId: user.tenantId, sourceId: { in: sourceIds } };
    return this.prisma.communicationProjectSuggestion.findMany({
      where,
      include: {
        source: true,
        project: true
      },
      orderBy: [{ status: "asc" }, { confidence: "desc" }, { updatedAt: "desc" }],
      take
    });
  }

  private async findVisibleSources(user: CurrentUser) {
    const base: Prisma.CommunicationSourceWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null
    };
    if (this.access.isCompanyAdmin(user)) {
      return this.prisma.communicationSource.findMany({
        where: base,
        orderBy: [{ updatedAt: "desc" }]
      });
    }
    const departmentId = user.departmentId ?? "__no_department__";
    return this.prisma.communicationSource.findMany({
      where: {
        ...base,
        OR: [
          { departmentIds: { has: departmentId } },
          { memberScopeUserIds: { has: user.id } },
          { messages: { some: { mappedUserId: user.id, tenantId: user.tenantId } } }
        ]
      },
      orderBy: [{ updatedAt: "desc" }]
    });
  }

  private async findVisibleBindings(user: CurrentUser) {
    if (this.access.isCompanyAdmin(user)) {
      return this.prisma.wecomUserBinding.findMany({
        where: { tenantId: user.tenantId },
        include: { user: { include: { department: true } } },
        orderBy: [{ mappingStatus: "asc" }, { updatedAt: "desc" }]
      });
    }
    const visibleUsers = await this.prisma.user.findMany({
      where: this.access.userWhere(user),
      select: { id: true }
    });
    const visibleUserIds = visibleUsers.map((item) => item.id);
    if (!visibleUserIds.length) {
      return [];
    }
    return this.prisma.wecomUserBinding.findMany({
      where: { tenantId: user.tenantId, userId: { in: visibleUserIds } },
      include: { user: { include: { department: true } } },
      orderBy: [{ mappingStatus: "asc" }, { updatedAt: "desc" }]
    });
  }

  private async findVisibleDrafts(user: CurrentUser, take: number) {
    const where = await this.visibleDraftWhere(user);
    const drafts = await this.prisma.communicationInsight.findMany({
      where,
      include: {
        source: true,
        project: true,
        suggestedUser: { include: { department: true } }
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take
    });
    const messageIds = unique(drafts.flatMap((draft) => safeArray(draft.sourceMessageIds)));
    const messages = messageIds.length
      ? await this.prisma.communicationMessage.findMany({
          where: { tenantId: user.tenantId, id: { in: messageIds } },
          include: { source: true },
          orderBy: [{ sentAt: "asc" }]
        })
      : [];
    const messageById = new Map(messages.map((item) => [item.id, item]));
    const fileIds = unique(drafts.flatMap((draft) => safeArray(draft.sourceFileIds)));
    const files = fileIds.length
      ? await this.prisma.communicationFile.findMany({
          where: { tenantId: user.tenantId, id: { in: fileIds }, deletedAt: null },
          include: { source: true },
          orderBy: [{ sentAt: "asc" }]
        })
      : [];
    const fileById = new Map(files.map((item) => [item.id, item]));
    return drafts.map((draft) => ({
      ...draft,
      sourceMessages: safeArray(draft.sourceMessageIds).map((messageId) => messageById.get(messageId)).filter(Boolean),
      sourceFiles: safeArray(draft.sourceFileIds).map((fileId) => fileById.get(fileId)).filter(Boolean)
    }));
  }

  private async getVisibleDraft(user: CurrentUser, id: string) {
    const where = await this.visibleDraftWhere(user);
    const insight = await this.prisma.communicationInsight.findFirst({
      where: { ...where, id },
      include: {
        source: true,
        project: true,
        suggestedUser: { include: { department: true } }
      }
    });
    if (!insight) {
      throw new NotFoundException("候选草稿不存在或无权访问");
    }
    return insight;
  }

  private async visibleDraftWhere(user: CurrentUser): Promise<Prisma.CommunicationInsightWhereInput> {
    const base: Prisma.CommunicationInsightWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      status: CommunicationInsightStatus.CANDIDATE,
      type: CommunicationInsightType.WORK_LOG_DRAFT
    };
    if (this.access.isCompanyAdmin(user)) {
      return base;
    }
    if (this.access.isDepartmentManager(user)) {
      return {
        ...base,
        suggestedUser: {
          departmentId: user.departmentId ?? "__no_department__"
        }
      };
    }
    return { ...base, suggestedUserId: user.id };
  }

  private async generateDraftInsights(tenantId: string, sourceId: string, messages: Array<{ id: string; mappedUserId: string | null; sentAt: Date; content: string; senderType: CommunicationSenderType; mappingStatus: WecomUserMappingStatus }>) {
    const source = await this.prisma.communicationSource.findFirst({
      where: { id: sourceId, tenantId, deletedAt: null }
    });
    if (!source?.generateLogDrafts) {
      return [];
    }
    const grouped = new Map<string, typeof messages>();
    for (const message of messages) {
      if (message.senderType !== CommunicationSenderType.INTERNAL) continue;
      if (!message.mappedUserId) continue;
      if (message.mappingStatus !== WecomUserMappingStatus.AUTO && message.mappingStatus !== WecomUserMappingStatus.CONFIRMED) continue;
      const key = `${message.mappedUserId}:${dateKey(message.sentAt)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), message]);
    }
    const created = [];
    for (const [key, group] of grouped.entries()) {
      const [mappedUserId, date] = key.split(":");
      const groupMessageIds = group.map((message) => message.id);
      const sourceFiles = await this.prisma.communicationFile.findMany({
        where: { tenantId, messageId: { in: groupMessageIds }, deletedAt: null },
        orderBy: [{ sentAt: "asc" }]
      });
      const fileEvidence = sourceFiles.map((file) => file.aiSummary || file.textContent || file.fileName).filter(Boolean).join("\n");
      const content = [group.map((message) => message.content).join("\n"), fileEvidence].filter(Boolean).join("\n");
      const project = await this.inferProject(tenantId, source, content);
      const riskTexts = /风险|延期|问题|异常|投诉|返工/.test(content) ? [clampText(content, 90)] : [];
      const blockerTexts = /阻塞|卡住|依赖|等(.{0,8})确认|无法继续/.test(content) ? [clampText(content, 90)] : [];
      const title = this.suggestTitle(content, project?.name);
      const insight = await this.prisma.communicationInsight.create({
        data: {
          tenantId,
          sourceId,
          suggestedUserId: mappedUserId,
          type: CommunicationInsightType.WORK_LOG_DRAFT,
          status: CommunicationInsightStatus.CANDIDATE,
          date: parseDateOnly(date),
          title,
          content: this.suggestContent(content),
          hours: null,
          projectId: project?.id ?? null,
          projectHints: project ? [project.code ? `${project.code} · ${project.name}` : project.name] : [],
          risks: riskTexts,
          blockers: blockerTexts,
          nextActions: riskTexts.length || blockerTexts.length ? ["确认影响范围、负责人和处理时间。"] : ["补充工时并确认项目归属后提交。"],
          sourceMessageIds: groupMessageIds,
          sourceFileIds: sourceFiles.map((file) => file.id),
          confidence: project ? 0.86 : 0.72,
          missingFields: project ? ["工时"] : ["工时", "项目"],
          needsProjectConfirmation: !project,
          needsUserMappingConfirmation: false
        }
      });
      created.push(insight);
    }
    return created;
  }

  private async inferProject(tenantId: string, source: { sourceType: CommunicationSourceType; projectIds: string[] }, content: string) {
    if (source.sourceType === CommunicationSourceType.PROJECT && source.projectIds.length) {
      return this.prisma.project.findFirst({
        where: { id: source.projectIds[0], tenantId, deletedAt: null }
      });
    }
    const projects = await this.prisma.project.findMany({
      where: { tenantId, deletedAt: null }
    });
    return (
      projects.find((project) => {
        const values = [project.code, project.name].filter(Boolean) as string[];
        return values.some((value) => content.includes(value));
      }) ?? null
    );
  }

  private suggestTitle(content: string, projectName?: string) {
    const firstLine = content.split(/\n|。|；|;/).map((item) => item.trim()).find(Boolean) ?? "沟通记录候选日报";
    const title = clampText(firstLine.replace(/^(今天|今日|上午|下午|晚上)/, ""), 28);
    return projectName ? `${projectName}：${title}` : title;
  }

  private suggestContent(content: string) {
    const lines = content.split(/\n+/).map((item) => item.trim()).filter(Boolean);
    return lines.length > 1 ? lines.map((item) => `- ${item}`).join("\n") : content.trim();
  }

  private fileMessageContent(files: WecomArchiveMessage["files"]) {
    if (!files?.length) return "企业微信文件消息";
    return files.map((file) => `文件：${file.fileName ?? "未命名文件"}`).join("\n");
  }

  private messageType(value?: WecomArchiveMessage["msgType"]) {
    if (!value) return CommunicationMessageType.TEXT;
    return CommunicationMessageType[value] ?? CommunicationMessageType.OTHER;
  }

  private fileKind(mimeType?: string | null, fileName?: string | null) {
    const normalized = (mimeType ?? "").toLowerCase();
    if (normalized.startsWith("image/")) return CommunicationFileKind.IMAGE;
    if (normalized.startsWith("audio/")) return CommunicationFileKind.VOICE;
    if (normalized.startsWith("video/")) return CommunicationFileKind.VIDEO;
    if (/^https?:\/\//i.test(fileName ?? "")) return CommunicationFileKind.LINK;
    return CommunicationFileKind.FILE;
  }

  private summarizeFile(fileName?: string | null, mimeType?: string | null, fileSize?: number | null, textContent?: string | null) {
    const size = fileSize ? `，大小 ${Math.max(1, Math.round(fileSize / 1024))}KB` : "";
    if (textContent) {
      return `来源文件：${fileName ?? "未命名文件"}，类型 ${mimeType ?? "未知"}${size}。摘要：${clampText(textContent, 160)}`;
    }
    return `来源文件：${fileName ?? "未命名文件"}，类型 ${mimeType ?? "未知"}${size}。`;
  }

  private async generateProjectSuggestions(tenantId: string, sourceId: string) {
    const source = await this.prisma.communicationSource.findFirst({
      where: { id: sourceId, tenantId, deletedAt: null }
    });
    if (!source) return [];
    const [projects, messages, files] = await Promise.all([
      this.prisma.project.findMany({ where: { tenantId, deletedAt: null } }),
      this.prisma.communicationMessage.findMany({
        where: { tenantId, sourceId },
        take: 80,
        orderBy: [{ sentAt: "desc" }]
      }),
      this.prisma.communicationFile.findMany({
        where: { tenantId, sourceId, deletedAt: null },
        take: 80,
        orderBy: [{ sentAt: "desc" }]
      })
    ]);
    const corpus = `${source.name}\n${messages.map((item) => item.content).join("\n")}\n${files.map((item) => `${item.fileName}\n${item.aiSummary ?? ""}`).join("\n")}`;
    const created = [];
    for (const project of projects) {
      if (source.projectIds.includes(project.id)) continue;
      const tokens = unique([project.code, project.name]).filter((item) => item.length >= 2);
      if (!tokens.length) continue;
      const groupNameHit = tokens.some((token) => source.name.includes(token));
      const messageHit = tokens.some((token) => messages.some((message) => message.content.includes(token)));
      const fileHit = tokens.some((token) => files.some((file) => file.fileName.includes(token) || (file.aiSummary ?? "").includes(token)));
      const confidence = Math.min(0.98, (groupNameHit ? 0.54 : 0) + (messageHit ? 0.28 : 0) + (fileHit ? 0.22 : 0));
      if (confidence < 0.4) continue;
      const reason = [
        groupNameHit ? "群名命中项目编号或名称" : null,
        messageHit ? "消息内容频繁命中项目关键词" : null,
        fileHit ? "文件名或文件摘要命中项目关键词" : null
      ].filter(Boolean).join("；");
      const suggestion = await this.prisma.communicationProjectSuggestion.upsert({
        where: { tenantId_sourceId_projectId: { tenantId, sourceId, projectId: project.id } },
        update: {
          confidence,
          reason,
          evidence: {
            groupName: source.name,
            keywords: tokens,
            sample: clampText(corpus, 240)
          }
        },
        create: {
          tenantId,
          sourceId,
          projectId: project.id,
          confidence,
          reason,
          evidence: {
            groupName: source.name,
            keywords: tokens,
            sample: clampText(corpus, 240)
          }
        },
        include: { source: true, project: true }
      });
      created.push(suggestion);
    }
    return created;
  }

  private async demoTextMessages(tenantId: string, corpId: string, sourceId: string) {
    const bindings = await this.prisma.wecomUserBinding.findMany({
      where: {
        tenantId,
        wecomCorpId: corpId,
        userId: { not: null },
        mappingStatus: { in: [WecomUserMappingStatus.AUTO, WecomUserMappingStatus.CONFIRMED] }
      },
      take: 2,
      orderBy: [{ updatedAt: "desc" }]
    });
    const today = dateKey(new Date());
    return bindings.map((binding, index) => ({
      msgId: `demo-wecom-${sourceId}-${today}-${binding.wecomUserId}-${index + 1}`,
      senderWecomUserId: binding.wecomUserId,
      senderName: binding.wecomName,
      sentAt: `${today}T0${9 + index}:30:00.000Z`,
      content:
        index === 0
          ? "今天完成支付回调联调，定位到证书配置问题，已提交修复方案；还有证书轮换流程未固化的风险。"
          : "小程序改版验收反馈已整理，阻塞点是客户还未确认埋点口径，明天继续跟进。"
    }));
  }

  private async refreshSourceCounters(sourceId: string) {
    const source = await this.prisma.communicationSource.findFirst({ where: { id: sourceId } });
    if (!source) return;
    const [pendingDraftCount, unclassifiedCount] = await Promise.all([
      this.prisma.communicationInsight.count({
        where: {
          tenantId: source.tenantId,
          sourceId,
          type: CommunicationInsightType.WORK_LOG_DRAFT,
          status: CommunicationInsightStatus.CANDIDATE,
          deletedAt: null
        }
      }),
      this.prisma.communicationMessage.count({
        where: {
          tenantId: source.tenantId,
          sourceId,
          mappedUserId: null,
          senderType: { not: CommunicationSenderType.EXTERNAL }
        }
      })
    ]);
    await this.prisma.communicationSource.update({
      where: { id: sourceId },
      data: {
        pendingDraftCount,
        unclassifiedCount,
        lastSyncAt: new Date(),
        lastSyncStatus: CommunicationSyncStatus.OK,
        lastError: null
      }
    });
  }

  private async ensureDefaultSource(tenantId: string, integrationId: string) {
    return this.prisma.communicationSource.upsert({
      where: { tenantId_chatId: { tenantId, chatId: "demo-general-chat" } },
      update: { integrationId },
      create: {
        tenantId,
        integrationId,
        name: "通用沟通群",
        chatId: "demo-general-chat",
        sourceType: CommunicationSourceType.GENERAL,
        projectIds: [],
        departmentIds: [],
        memberScopeUserIds: [],
        generateLogDrafts: true,
        generateProjectRisks: true,
        syncFiles: false,
        retentionDays: 180
      }
    });
  }

  private async getSource(tenantId: string, id: string) {
    const source = await this.prisma.communicationSource.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
    if (!source) {
      throw new NotFoundException("沟通来源不存在");
    }
    return source;
  }

  private sourcePayload(dto: SaveCommunicationSourceDto) {
    return {
      name: dto.name.trim(),
      chatId: dto.chatId.trim(),
      sourceType: dto.sourceType,
      projectIds: unique(dto.projectIds ?? []),
      departmentIds: unique(dto.departmentIds ?? []),
      memberScopeUserIds: unique(dto.memberScopeUserIds ?? []),
      generateLogDrafts: dto.generateLogDrafts,
      generateProjectRisks: dto.generateProjectRisks,
      syncFiles: dto.syncFiles,
      retentionDays: dto.retentionDays
    };
  }

  private async assertSourceReferences(tenantId: string, dto: SaveCommunicationSourceDto) {
    const projectIds = unique(dto.projectIds ?? []);
    if (projectIds.length) {
      const count = await this.prisma.project.count({
        where: { id: { in: projectIds }, tenantId, deletedAt: null }
      });
      if (count !== projectIds.length) {
        throw new NotFoundException("部分项目不存在");
      }
    }
    const departmentIds = unique(dto.departmentIds ?? []);
    if (departmentIds.length) {
      const count = await this.prisma.department.count({
        where: { id: { in: departmentIds }, tenantId, deletedAt: null }
      });
      if (count !== departmentIds.length) {
        throw new NotFoundException("部分部门不存在");
      }
    }
    const memberScopeUserIds = unique(dto.memberScopeUserIds ?? []);
    if (memberScopeUserIds.length) {
      const count = await this.prisma.user.count({
        where: { id: { in: memberScopeUserIds }, tenantId, deletedAt: null }
      });
      if (count !== memberScopeUserIds.length) {
        throw new NotFoundException("部分成员不存在");
      }
    }
  }

  private async assertProjectInTenant(tenantId: string, projectId?: string | null) {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, deletedAt: null },
      select: { id: true }
    });
    if (!project) {
      throw new NotFoundException("项目不存在");
    }
  }

  private async getActiveOrLatestIntegration(tenantId: string) {
    const integration = await this.prisma.wecomIntegration.findFirst({
      where: { tenantId, deletedAt: null },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
    if (!integration) {
      throw new BadRequestException("请先保存企业微信会话内容存档配置");
    }
    return integration;
  }

  private memberWecomUserId(member: { id: string; email: string | null }) {
    if (member.email) {
      return member.email.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "_");
    }
    return `u_${member.id.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  }

  private async ensureDemoExceptionBindings(tenantId: string, corpId: string) {
    const examples = [
      {
        wecomUserId: "external_customer_a",
        wecomName: "客户A联系人",
        mappingStatus: WecomUserMappingStatus.EXTERNAL,
        confidence: 0
      },
      {
        wecomUserId: "unknown_contractor",
        wecomName: "临时协作成员",
        mappingStatus: WecomUserMappingStatus.UNMAPPED,
        confidence: 0.2
      }
    ];
    for (const example of examples) {
      await this.prisma.wecomUserBinding.upsert({
        where: { tenantId_wecomCorpId_wecomUserId: { tenantId, wecomCorpId: corpId, wecomUserId: example.wecomUserId } },
        update: {},
        create: {
          tenantId,
          wecomCorpId: corpId,
          wecomUserId: example.wecomUserId,
          wecomName: example.wecomName,
          mobile: null,
          email: null,
          departmentIds: [],
          mappingStatus: example.mappingStatus,
          confidence: example.confidence
        }
      });
    }
  }

  private assertCanManageWecom(user: CurrentUser) {
    if (!this.access.isCompanyAdmin(user)) {
      throw new ForbiddenException("只有企业管理员可以配置企业微信集成");
    }
  }

  private writeAudit(user: CurrentUser, action: string, targetType?: string, targetId?: string | null, metadata?: Prisma.InputJsonValue) {
    return this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action,
      targetType,
      targetId,
      metadata
    });
  }
}
