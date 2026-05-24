import { ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { WorkLogStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { AiQueueService } from "../ai/ai-queue.service";
import { CreateWorkLogDto, UpdateWorkLogDto, WorkLogQueryDto } from "./dto/work-log.dto";

function parseDateOnly(value: string) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
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
        aiAnalysis: true
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
    return this.prisma.workLog.create({
      data: {
        tenantId: user.tenantId,
        userId: targetUserId,
        projectId: dto.projectId || null,
        date: parseDateOnly(dto.date),
        title: dto.title,
        content: dto.content,
        startTime: dto.startTime ? new Date(dto.startTime) : null,
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        hours: dto.hours.toString(),
        status: WorkLogStatus.DRAFT
      },
      include: { user: true, project: true, aiAnalysis: true }
    });
  }

  async get(user: CurrentUser, id: string) {
    const item = await this.prisma.workLog.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      include: {
        user: { include: { department: true } },
        project: true,
        aiAnalysis: true
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
    const item = await this.prisma.workLog.update({
      where: { id },
      data: {
        projectId: dto.projectId === undefined ? undefined : dto.projectId || null,
        date: dto.date ? parseDateOnly(dto.date) : undefined,
        title: dto.title,
        content: dto.content,
        startTime: dto.startTime === undefined ? undefined : dto.startTime ? new Date(dto.startTime) : null,
        endTime: dto.endTime === undefined ? undefined : dto.endTime ? new Date(dto.endTime) : null,
        hours: dto.hours === undefined ? undefined : dto.hours.toString()
      },
      include: { user: true, project: true, aiAnalysis: true }
    });
    return item;
  }

  async remove(user: CurrentUser, id: string) {
    const existing = await this.get(user, id);
    this.assertCanModifyWorkLog(user, existing.userId);
    await this.prisma.workLog.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
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
      include: { user: true, project: true, aiAnalysis: true }
    });
    await this.aiQueue.enqueueWorkLogAnalysis(user.tenantId, id, user.id);
    return submitted;
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
        aiAnalysis: true
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
