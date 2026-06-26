import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { WorkLogAttachmentKind, WorkLogKind, WorkLogStatus } from "@prisma/client";
import { createReadStream, type ReadStream } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import { basename, join } from "path";
import { randomBytes } from "crypto";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { AiQueueService } from "../ai/ai-queue.service";
import { CreateWorkLogAttachmentDto, CreateWorkLogDto, UpdateWorkLogDto, WorkLogQueryDto } from "./dto/work-log.dto";

const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const ATTACHMENT_TEXT_LIMIT = 12_000;
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
};

const sourceLinksPublicInclude = {
  source: true,
  message: true,
  file: true,
  insight: true
};

function attachmentStorageRoot() {
  return process.env.WORK_LOG_ATTACHMENT_DIR ?? join(process.cwd(), "tmp", "work-log-attachments");
}

function parseDateOnly(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayKeyInShanghai() {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return dateKey(new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate())));
}

function resolveWorkLogKind(date: Date, kind?: WorkLogKind | null) {
  if (kind) return kind;
  return dateKey(date) > todayKeyInShanghai() ? WorkLogKind.PLAN : WorkLogKind.DAILY;
}

function parseOptionalDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Invalid start or end time");
  }
  return date;
}

function roundHours(value: number) {
  return Number(value.toFixed(2));
}

function durationHours(startTime: Date, endTime: Date) {
  let diff = endTime.getTime() - startTime.getTime();
  if (diff < 0) {
    diff += 24 * 60 * 60 * 1000;
  }
  return roundHours(diff / 60 / 60 / 1000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + Math.round(hours * 60) * 60 * 1000);
}

function subtractHours(date: Date, hours: number) {
  return new Date(date.getTime() - Math.round(hours * 60) * 60 * 1000);
}

function normalizeTiming(startTime: Date | null, endTime: Date | null, hours: number | null) {
  let normalizedStartTime = startTime;
  let normalizedEndTime = endTime;
  let normalizedHours = hours;

  if (normalizedStartTime && normalizedEndTime && (normalizedHours === null || !Number.isFinite(normalizedHours) || normalizedHours <= 0)) {
    normalizedHours = durationHours(normalizedStartTime, normalizedEndTime);
  } else if (normalizedStartTime && normalizedHours !== null) {
    normalizedEndTime = addHours(normalizedStartTime, normalizedHours);
  } else if (normalizedEndTime && normalizedHours !== null) {
    normalizedStartTime = subtractHours(normalizedEndTime, normalizedHours);
  }

  if (normalizedHours === null || !Number.isFinite(normalizedHours)) {
    normalizedHours = 0;
  }
  if (normalizedHours < 0 || normalizedHours > 24) {
    throw new BadRequestException("Hours must be between 0 and 24");
  }

  return {
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    hours: normalizedHours
  };
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function sanitizeFileName(value: string) {
  const name = basename(value || "attachment")
    .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (name || "attachment").slice(0, 180);
}

function attachmentKind(mimeType: string) {
  return mimeType.toLowerCase().startsWith("image/") ? WorkLogAttachmentKind.IMAGE : WorkLogAttachmentKind.FILE;
}

function isTextLike(mimeType: string, fileName: string) {
  const normalized = mimeType.toLowerCase();
  if (normalized.startsWith("text/")) return true;
  if (["application/json", "application/xml", "application/csv", "application/x-ndjson"].includes(normalized)) return true;
  return /\.(txt|md|csv|json|log|xml)$/i.test(fileName);
}

function extractTextContent(mimeType: string, fileName: string, buffer: Buffer) {
  if (!isTextLike(mimeType, fileName)) {
    return null;
  }
  return buffer.toString("utf8").replace(/\u0000/g, "").slice(0, ATTACHMENT_TEXT_LIMIT);
}

function summarizeAttachment(kind: WorkLogAttachmentKind, fileName: string, mimeType: string, fileSize: number, textContent: string | null) {
  const base = `${kind === WorkLogAttachmentKind.IMAGE ? "图片" : "文件"}附件：${fileName}，类型 ${mimeType}，大小 ${Math.round(fileSize / 1024)}KB。`;
  if (!textContent) {
    return base;
  }
  return `${base} 文本摘录：${textContent.slice(0, 500)}`;
}

@Injectable()
export class WorkLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    @Inject(forwardRef(() => AiQueueService))
    private readonly aiQueue: AiQueueService
  ) {}

  async list(user: CurrentUser, query: WorkLogQueryDto) {
    const where = this.access.workLogWhere(user);
    if (query.userId) {
      const target = await this.prisma.user.findFirstOrThrow({
        where: { id: query.userId, tenantId: user.tenantId, deletedAt: null }
      });
      this.access.assertCanAccessUser(user, target);
      where.userId = query.userId;
    }
    if (query.projectId) {
      await this.assertProjectInTenant(user.tenantId, query.projectId);
      where.projectId = query.projectId;
    }
    if (query.kind) {
      where.kind = query.kind;
    }
    if (query.date) {
      where.date = parseDateOnly(query.date);
    } else if (query.from || query.to) {
      where.date = {
        gte: query.from ? parseDateOnly(query.from) : undefined,
        lte: query.to ? parseDateOnly(query.to) : undefined
      };
    }

    const items = await this.prisma.workLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, departmentId: true, department: true } },
        project: true,
        aiAnalysis: true,
        attachments: {
          where: { deletedAt: null },
          select: attachmentPublicSelect,
          orderBy: [{ createdAt: "asc" }]
        },
        sourceLinks: {
          include: sourceLinksPublicInclude,
          orderBy: [{ createdAt: "asc" }]
        }
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    });
    return items;
  }

  async create(user: CurrentUser, dto: CreateWorkLogDto) {
    const targetUserId = dto.userId && this.access.isCompanyAdmin(user) ? dto.userId : user.id;
    const target = await this.prisma.user.findFirstOrThrow({
      where: { id: targetUserId, tenantId: user.tenantId, deletedAt: null }
    });
    this.access.assertCanAccessUser(user, target);
    await this.assertProjectInTenant(user.tenantId, dto.projectId);
    const workDate = parseDateOnly(dto.date);
    const timing = normalizeTiming(parseOptionalDate(dto.startTime), parseOptionalDate(dto.endTime), dto.hours ?? null);
    return this.prisma.workLog.create({
      data: {
        tenantId: user.tenantId,
        userId: targetUserId,
        projectId: dto.projectId || null,
        date: workDate,
        kind: resolveWorkLogKind(workDate, dto.kind),
        title: dto.title,
        content: dto.content,
        startTime: timing.startTime,
        endTime: timing.endTime,
        hours: timing.hours.toString(),
        status: WorkLogStatus.DRAFT
      },
      include: {
        user: true,
        project: true,
        aiAnalysis: true,
        attachments: {
          where: { deletedAt: null },
          select: attachmentPublicSelect,
          orderBy: [{ createdAt: "asc" }]
        },
        sourceLinks: {
          include: sourceLinksPublicInclude,
          orderBy: [{ createdAt: "asc" }]
        }
      }
    });
  }

  async get(user: CurrentUser, id: string) {
    const item = await this.prisma.workLog.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        user: { include: { department: true } },
        project: true,
        aiAnalysis: true,
        attachments: {
          where: { deletedAt: null },
          select: attachmentPublicSelect,
          orderBy: [{ createdAt: "asc" }]
        },
        sourceLinks: {
          include: sourceLinksPublicInclude,
          orderBy: [{ createdAt: "asc" }]
        }
      }
    });
    if (!item) {
      throw new NotFoundException("Work log not found");
    }
    this.access.assertCanAccessUser(user, item.user);
    return item;
  }

  async update(user: CurrentUser, id: string, dto: UpdateWorkLogDto) {
    const existing = await this.get(user, id);
    this.assertCanModifyWorkLog(user, existing.userId);
    await this.assertProjectInTenant(user.tenantId, dto.projectId);
    const timing = normalizeTiming(
      Object.prototype.hasOwnProperty.call(dto, "startTime") ? parseOptionalDate(dto.startTime) : existing.startTime,
      Object.prototype.hasOwnProperty.call(dto, "endTime") ? parseOptionalDate(dto.endTime) : existing.endTime,
      Object.prototype.hasOwnProperty.call(dto, "hours") ? dto.hours ?? null : Number(existing.hours)
    );
    const item = await this.prisma.workLog.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : dto.projectId || null,
        date: dto.date ? parseDateOnly(dto.date) : undefined,
        kind: dto.kind,
        title: dto.title,
        content: dto.content,
        startTime: timing.startTime,
        endTime: timing.endTime,
        hours: timing.hours.toString()
      },
      include: {
        user: true,
        project: true,
        aiAnalysis: true,
        attachments: {
          where: { deletedAt: null },
          select: attachmentPublicSelect,
          orderBy: [{ createdAt: "asc" }]
        },
        sourceLinks: {
          include: sourceLinksPublicInclude,
          orderBy: [{ createdAt: "asc" }]
        }
      }
    });
    return item;
  }

  async remove(user: CurrentUser, id: string) {
    const existing = await this.get(user, id);
    this.assertCanModifyWorkLog(user, existing.userId);
    const deletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.workLog.update({
        where: { id },
        data: { deletedAt }
      }),
      this.prisma.workLogAttachment.updateMany({
        where: { tenantId: user.tenantId, workLogId: id, deletedAt: null },
        data: { deletedAt }
      })
    ]);
    return { ok: true };
  }

  async submit(user: CurrentUser, id: string) {
    const existing = await this.get(user, id);
    this.assertCanModifyWorkLog(user, existing.userId);
    const submitted = await this.prisma.workLog.update({
      where: { id },
      data: {
        status: WorkLogStatus.SUBMITTED,
        submittedAt: new Date()
      },
      include: {
        user: true,
        project: true,
        aiAnalysis: true,
        attachments: {
          where: { deletedAt: null },
          select: attachmentPublicSelect,
          orderBy: [{ createdAt: "asc" }]
        },
        sourceLinks: {
          include: sourceLinksPublicInclude,
          orderBy: [{ createdAt: "asc" }]
        }
      }
    });
    await this.aiQueue.enqueueWorkLogAnalysis(user.tenantId, id, user.id);
    return submitted;
  }

  async createAttachment(user: CurrentUser, id: string, dto: CreateWorkLogAttachmentDto) {
    const existing = await this.get(user, id);
    this.assertCanModifyWorkLog(user, existing.userId);

    const buffer = Buffer.from(dto.contentBase64, "base64");
    if (!buffer.length || buffer.length !== dto.fileSize || buffer.length > ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException("Invalid attachment content or file size");
    }

    const fileName = sanitizeFileName(dto.fileName);
    const mimeType = dto.mimeType || "application/octet-stream";
    const kind = attachmentKind(mimeType);
    const tenantDir = join(attachmentStorageRoot(), user.tenantId, id);
    await mkdir(tenantDir, { recursive: true });
    const storedName = `${Date.now()}-${randomBytes(6).toString("hex")}-${fileName}`;
    const storagePath = join(tenantDir, storedName);
    await writeFile(storagePath, buffer);

    const textContent = extractTextContent(mimeType, fileName, buffer);
    const attachment = await this.prisma.workLogAttachment.create({
      data: {
        tenantId: user.tenantId,
        workLogId: id,
        uploaderId: user.id,
        kind,
        fileName,
        mimeType,
        fileSize: buffer.length,
        storagePath,
        textContent,
        aiSummary: summarizeAttachment(kind, fileName, mimeType, buffer.length, textContent)
      },
      select: attachmentPublicSelect
    });

    if (existing.status === WorkLogStatus.SUBMITTED) {
      await this.aiQueue.enqueueWorkLogAnalysis(user.tenantId, id, user.id);
    }

    return attachment;
  }

  async removeAttachment(user: CurrentUser, id: string, attachmentId: string) {
    const existing = await this.get(user, id);
    this.assertCanModifyWorkLog(user, existing.userId);
    const attachment = await this.prisma.workLogAttachment.findFirst({
      where: { id: attachmentId, tenantId: user.tenantId, workLogId: id, deletedAt: null },
      select: { id: true }
    });
    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }
    await this.prisma.workLogAttachment.update({
      where: { id: attachment.id },
      data: { deletedAt: new Date() }
    });
    if (existing.status === WorkLogStatus.SUBMITTED) {
      await this.aiQueue.enqueueWorkLogAnalysis(user.tenantId, id, user.id);
    }
    return { ok: true };
  }

  async openAttachmentDownload(
    user: CurrentUser,
    id: string,
    attachmentId: string
  ): Promise<{ stream: ReadStream; fileName: string; mimeType: string; fileSize: number }> {
    await this.get(user, id);
    const attachment = await this.prisma.workLogAttachment.findFirst({
      where: { id: attachmentId, tenantId: user.tenantId, workLogId: id, deletedAt: null }
    });
    if (!attachment) {
      throw new NotFoundException("Attachment not found");
    }
    try {
      const info = await stat(attachment.storagePath);
      if (!info.isFile()) {
        throw new Error("Attachment path is not a file");
      }
    } catch {
      throw new NotFoundException("Attachment file not found");
    }
    return {
      stream: createReadStream(attachment.storagePath),
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize
    };
  }

  async findSubmittedInRange(tenantId: string, userIds: string[], start: Date, end: Date) {
    if (!userIds.length) {
      return [];
    }
    return this.prisma.workLog.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        date: { gte: start, lte: addDays(end, 0) },
        status: WorkLogStatus.SUBMITTED,
        deletedAt: null
      },
      include: {
        user: { include: { department: true } },
        project: true,
        aiAnalysis: true,
        attachments: {
          where: { deletedAt: null },
          select: attachmentPublicSelect,
          orderBy: [{ createdAt: "asc" }]
        },
        sourceLinks: {
          include: sourceLinksPublicInclude,
          orderBy: [{ createdAt: "asc" }]
        }
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
    });
  }

  private assertCanModifyWorkLog(user: CurrentUser, ownerId: string) {
    if (ownerId === user.id || this.access.isCompanyAdmin(user)) {
      return;
    }
    throw new ForbiddenException("Only owner or company admin can modify this work log");
  }

  private async assertProjectInTenant(tenantId: string, projectId?: string | null) {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, deletedAt: null },
      select: { id: true }
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }
  }
}
