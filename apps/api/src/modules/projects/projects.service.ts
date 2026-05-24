import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ProjectStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from "./dto/project.dto";

function parseDateOnly(value?: string | null) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeText(value?: string | null) {
  if (value === undefined) return undefined;
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService
  ) {}

  async list(user: CurrentUser, query: ProjectQueryDto) {
    const where: Prisma.ProjectWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null,
      status: query.status
    };
    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } }
      ];
    }
    return this.prisma.project.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true, departmentId: true, department: true } }
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
  }

  async create(user: CurrentUser, dto: CreateProjectDto) {
    this.access.assertCanManageOrg(user);
    await this.ensureOwner(user.tenantId, dto.ownerUserId);
    const project = await this.prisma.project.create({
      data: {
        tenantId: user.tenantId,
        code: normalizeText(dto.code),
        name: dto.name.trim(),
        description: normalizeText(dto.description),
        status: dto.status ?? ProjectStatus.ACTIVE,
        ownerUserId: dto.ownerUserId || null,
        startDate: parseDateOnly(dto.startDate),
        endDate: parseDateOnly(dto.endDate)
      },
      include: {
        owner: { select: { id: true, name: true, email: true, departmentId: true, department: true } }
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PROJECT_CREATED",
      targetType: "Project",
      targetId: project.id,
      metadata: { name: project.name, code: project.code }
    });
    return project;
  }

  async update(user: CurrentUser, id: string, dto: UpdateProjectDto) {
    this.access.assertCanManageOrg(user);
    await this.ensureProject(user.tenantId, id);
    await this.ensureOwner(user.tenantId, dto.ownerUserId);
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        code: normalizeText(dto.code),
        name: dto.name?.trim(),
        description: normalizeText(dto.description),
        status: dto.status,
        ownerUserId: dto.ownerUserId === undefined ? undefined : dto.ownerUserId || null,
        startDate: parseDateOnly(dto.startDate),
        endDate: parseDateOnly(dto.endDate)
      },
      include: {
        owner: { select: { id: true, name: true, email: true, departmentId: true, department: true } }
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PROJECT_UPDATED",
      targetType: "Project",
      targetId: project.id,
      metadata: { name: project.name, status: project.status }
    });
    return project;
  }

  async remove(user: CurrentUser, id: string) {
    this.access.assertCanManageOrg(user);
    await this.ensureProject(user.tenantId, id);
    await this.prisma.project.update({
      where: { id },
      data: {
        status: ProjectStatus.ARCHIVED,
        deletedAt: new Date()
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "PROJECT_DELETED",
      targetType: "Project",
      targetId: id
    });
    return { ok: true };
  }

  private async ensureProject(tenantId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true }
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }
  }

  private async ensureOwner(tenantId: string, ownerUserId?: string | null) {
    if (!ownerUserId) return;
    const owner = await this.prisma.user.findFirst({
      where: { id: ownerUserId, tenantId, deletedAt: null },
      select: { id: true }
    });
    if (!owner) {
      throw new NotFoundException("Project owner not found");
    }
  }
}
