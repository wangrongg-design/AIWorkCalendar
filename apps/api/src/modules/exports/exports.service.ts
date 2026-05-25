import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { ExportScope, ExportTask, ExportTaskStatus } from "@prisma/client";
import { createReadStream } from "fs";
import { mkdir, stat, writeFile } from "fs/promises";
import { join } from "path";
import { deflateRawSync } from "zlib";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { ExportQueryDto } from "./dto/export-query.dto";

const ZIP_CONTENT_TYPE = "application/zip";
const EXPORT_EXPIRES_DAYS = 7;

type ExportTaskView = {
  id: string;
  scope: ExportScope;
  status: ExportTaskStatus;
  fileName: string | null;
  fileSize: number | null;
  contentType: string | null;
  expiresAt: Date;
  completedAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function metadata(scope: "self" | "tenant") {
  return {
    product: "Work Calendar AI",
    version: "0.1.0",
    exportScope: scope,
    exportedAt: new Date().toISOString(),
    confidentialityNotice: "所有企业数据均按租户隔离并视为保密数据。本导出文件仅供企业或用户自行备份、迁移和留存使用。"
  };
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function exportStorageDir() {
  return process.env.EXPORT_STORAGE_DIR ?? join(process.cwd(), "tmp", "exports");
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipSingleFile(entryName: string, content: Buffer) {
  const fileName = Buffer.from(entryName, "utf8");
  const compressed = deflateRawSync(content);
  const crc = crc32(content);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(0, 10);
  localHeader.writeUInt16LE(0, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(content.length, 22);
  localHeader.writeUInt16LE(fileName.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const centralHeader = Buffer.alloc(46);
  const centralDirectoryOffset = localHeader.length + fileName.length + compressed.length;
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(0, 12);
  centralHeader.writeUInt16LE(0, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(content.length, 24);
  centralHeader.writeUInt16LE(fileName.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE(0, 38);
  centralHeader.writeUInt32LE(0, 42);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralHeader.length + fileName.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([localHeader, fileName, compressed, centralHeader, fileName, end]);
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService
  ) {}

  async createExportTask(user: CurrentUser, query: ExportQueryDto) {
    const scope = this.resolveScope(user, query);
    const task = await this.prisma.exportTask.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.id,
        scope,
        status: ExportTaskStatus.PENDING,
        contentType: ZIP_CONTENT_TYPE,
        expiresAt: addDays(new Date(), EXPORT_EXPIRES_DAYS),
        metadata: { requestedBy: user.id }
      }
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "DATA_EXPORT_TASK_CREATED",
      targetType: "ExportTask",
      targetId: task.id,
      metadata: { scope }
    });

    void this.generateExportFile(task.id).catch((error) => {
      this.logger.error(`Export task ${task.id} failed: ${(error as Error).message}`);
    });

    return this.toTaskView(task);
  }

  async listExportTasks(user: CurrentUser) {
    await this.expireCompletedTasks(user.tenantId);
    const tasks = await this.prisma.exportTask.findMany({
      where: {
        tenantId: user.tenantId,
        requesterId: user.id,
        deletedAt: null
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
    return tasks.map((task) => this.toTaskView(task));
  }

  async openDownload(user: CurrentUser, id: string) {
    await this.expireCompletedTasks(user.tenantId);
    const task = await this.prisma.exportTask.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        requesterId: user.id,
        deletedAt: null
      }
    });
    if (!task) {
      throw new NotFoundException("Export task not found");
    }
    if (task.status === ExportTaskStatus.EXPIRED || task.expiresAt < new Date()) {
      throw new GoneException("Export download has expired");
    }
    if (task.status !== ExportTaskStatus.COMPLETED || !task.filePath || !task.fileName) {
      throw new BadRequestException("Export file is not ready");
    }
    const fileStat = await stat(task.filePath);
    return {
      stream: createReadStream(task.filePath),
      fileName: task.fileName,
      contentType: task.contentType ?? ZIP_CONTENT_TYPE,
      fileSize: fileStat.size
    };
  }

  async exportData(user: CurrentUser, query: ExportQueryDto) {
    const scope = this.resolveScope(user, query);
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "DATA_EXPORTED",
      targetType: scope === ExportScope.TENANT ? "Tenant" : "User",
      targetId: scope === ExportScope.TENANT ? user.tenantId : user.id,
      metadata: { scope }
    });
    return this.buildExportData(user, scope);
  }

  private async generateExportFile(taskId: string) {
    let task = await this.prisma.exportTask.findFirst({
      where: { id: taskId, deletedAt: null },
      include: { tenant: true, requester: true }
    });
    if (!task) {
      throw new NotFoundException("Export task not found");
    }

    task = await this.prisma.exportTask.update({
      where: { id: task.id },
      data: { status: ExportTaskStatus.PROCESSING, error: null },
      include: { tenant: true, requester: true }
    });

    try {
      const data = await this.buildExportData({ id: task.requesterId, tenantId: task.tenantId }, task.scope);
      const scope = task.scope.toLowerCase();
      const fileName = `work-calendar-ai-${task.tenant.code}-${scope}-${timestampForFile()}.zip`;
      const entryName = fileName.replace(/\.zip$/, ".json");
      const jsonBuffer = Buffer.from(JSON.stringify(data, null, 2), "utf8");
      const zipBuffer = zipSingleFile(entryName, jsonBuffer);
      const dir = join(exportStorageDir(), task.tenantId);
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, `${task.id}.zip`);
      await writeFile(filePath, zipBuffer);
      const fileStat = await stat(filePath);

      const updated = await this.prisma.exportTask.update({
        where: { id: task.id },
        data: {
          status: ExportTaskStatus.COMPLETED,
          fileName,
          filePath,
          fileSize: fileStat.size,
          contentType: ZIP_CONTENT_TYPE,
          completedAt: new Date(),
          error: null,
          metadata: {
            jsonBytes: jsonBuffer.length,
            zipBytes: fileStat.size,
            expiresInDays: EXPORT_EXPIRES_DAYS
          }
        }
      });

      await this.audit.log({
        tenantId: task.tenantId,
        actorUserId: task.requesterId,
        action: "DATA_EXPORT_TASK_COMPLETED",
        targetType: "ExportTask",
        targetId: task.id,
        metadata: { scope: task.scope, fileSize: fileStat.size }
      });
      return updated;
    } catch (error) {
      await this.prisma.exportTask.update({
        where: { id: task.id },
        data: {
          status: ExportTaskStatus.FAILED,
          error: (error as Error).message
        }
      });
      await this.audit.log({
        tenantId: task.tenantId,
        actorUserId: task.requesterId,
        action: "DATA_EXPORT_TASK_FAILED",
        targetType: "ExportTask",
        targetId: task.id,
        metadata: { scope: task.scope, error: (error as Error).message }
      });
      throw error;
    }
  }

  private resolveScope(user: CurrentUser, query: ExportQueryDto) {
    const scope = query.scope ?? (this.access.isCompanyAdmin(user) ? "tenant" : "self");
    if (scope === "tenant") {
      if (!this.access.isCompanyAdmin(user)) {
        throw new ForbiddenException("Only company admins can export tenant data");
      }
      return ExportScope.TENANT;
    }
    return ExportScope.SELF;
  }

  private async buildExportData(user: Pick<CurrentUser, "id" | "tenantId">, scope: ExportScope) {
    return scope === ExportScope.TENANT ? this.exportTenant(user.tenantId) : this.exportSelf(user);
  }

  private async exportTenant(tenantId: string) {
    const [
      tenant,
      subscription,
      departments,
      projects,
      roles,
      users,
      workLogs,
      reports,
      notifications,
      aiTasks,
      billingOrders,
      payments,
      auditLogs,
      aiUsageLogs,
      dataDeletionRequests,
      exportTasks
    ] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null } }),
      this.prisma.subscription.findFirst({ where: { tenantId, deletedAt: null } }),
      this.prisma.department.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ name: "asc" }] }),
      this.prisma.project.findMany({
        where: { tenantId, deletedAt: null },
        include: { owner: { select: { id: true, email: true, phone: true, name: true, departmentId: true } } },
        orderBy: [{ status: "asc" }, { name: "asc" }]
      }),
      this.prisma.role.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ code: "asc" }] }),
      this.prisma.user.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          departmentId: true,
          email: true,
          phone: true,
          name: true,
          isActive: true,
          requiresWorkReport: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          department: true,
          roles: { where: { deletedAt: null }, include: { role: true } }
        },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.workLog.findMany({
        where: { tenantId, deletedAt: null },
        include: {
          user: { select: { id: true, email: true, phone: true, name: true, departmentId: true } },
          project: true,
          aiAnalysis: true
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.report.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.notification.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.aiTask.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.billingOrder.findMany({ where: { tenantId, deletedAt: null }, include: { payments: true }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.paymentRecord.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.aiUsageLog.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.dataDeletionRequest.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ createdAt: "asc" }] }),
      this.prisma.exportTask.findMany({
        where: { tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          requesterId: true,
          scope: true,
          status: true,
          fileName: true,
          fileSize: true,
          contentType: true,
          expiresAt: true,
          completedAt: true,
          error: true,
          metadata: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ createdAt: "asc" }]
      })
    ]);

    return {
      metadata: metadata("tenant"),
      tenant,
      subscription,
      departments,
      projects,
      roles,
      users,
      workLogs,
      reports,
      notifications,
      aiTasks,
      billingOrders,
      payments,
      auditLogs,
      aiUsageLogs,
      dataDeletionRequests,
      exportTasks
    };
  }

  private async exportSelf(user: Pick<CurrentUser, "id" | "tenantId">) {
    const [tenant, account, workLogs, reports, notifications, dataDeletionRequests, exportTasks] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { id: user.tenantId, deletedAt: null }, select: { id: true, name: true, code: true } }),
      this.prisma.user.findFirst({
        where: { id: user.id, tenantId: user.tenantId, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          departmentId: true,
          email: true,
          phone: true,
          name: true,
          isActive: true,
          requiresWorkReport: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          department: true,
          roles: { where: { deletedAt: null }, include: { role: true } }
        }
      }),
      this.prisma.workLog.findMany({
        where: { tenantId: user.tenantId, userId: user.id, deletedAt: null },
        include: { project: true, aiAnalysis: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }]
      }),
      this.prisma.report.findMany({
        where: { tenantId: user.tenantId, requesterId: user.id, deletedAt: null },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.notification.findMany({
        where: { tenantId: user.tenantId, userId: user.id, deletedAt: null },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.dataDeletionRequest.findMany({
        where: { tenantId: user.tenantId, requesterId: user.id, deletedAt: null },
        orderBy: [{ createdAt: "asc" }]
      }),
      this.prisma.exportTask.findMany({
        where: { tenantId: user.tenantId, requesterId: user.id, deletedAt: null },
        select: {
          id: true,
          tenantId: true,
          requesterId: true,
          scope: true,
          status: true,
          fileName: true,
          fileSize: true,
          contentType: true,
          expiresAt: true,
          completedAt: true,
          error: true,
          metadata: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ createdAt: "asc" }]
      })
    ]);

    return {
      metadata: metadata("self"),
      tenant,
      account,
      workLogs,
      reports,
      notifications,
      dataDeletionRequests,
      exportTasks
    };
  }

  private async expireCompletedTasks(tenantId: string) {
    await this.prisma.exportTask.updateMany({
      where: {
        tenantId,
        status: ExportTaskStatus.COMPLETED,
        expiresAt: { lt: new Date() },
        deletedAt: null
      },
      data: { status: ExportTaskStatus.EXPIRED }
    });
  }

  private toTaskView(task: ExportTask): ExportTaskView {
    return {
      id: task.id,
      scope: task.scope,
      status: task.status,
      fileName: task.fileName,
      fileSize: task.fileSize,
      contentType: task.contentType,
      expiresAt: task.expiresAt,
      completedAt: task.completedAt,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt
    };
  }
}
