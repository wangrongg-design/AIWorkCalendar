import { Injectable } from "@nestjs/common";
import { WorkLogStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { CalendarDayQueryDto, CalendarQueryDto } from "./dto/calendar-query.dto";

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 0));
  return { start, end };
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayKeyInShanghai() {
  const shanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return dateKey(new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate())));
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function arrayCount(value: unknown) {
  return Array.isArray(value) ? value.length : value ? 1 : 0;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  async calendar(user: CurrentUser, query: CalendarQueryDto) {
    const { start, end } = monthRange(query.month);
    const today = todayKeyInShanghai();
    const scope = this.access.resolveScope(user, query.scope, query.departmentId);
    const users = await this.prisma.user.findMany({
      where: {
        ...this.access.userWhere(user, scope.scope, scope.departmentId),
        requiresWorkReport: true
      },
      select: { id: true, name: true, email: true, phone: true, departmentId: true }
    });
    const userIds = users.map((item) => item.id);
    const logs = await this.prisma.workLog.findMany({
      where: {
        tenantId: user.tenantId,
        userId: { in: userIds },
        date: { gte: start, lte: end },
        status: WorkLogStatus.SUBMITTED,
        deletedAt: null
      },
      include: { aiAnalysis: true }
    });

    const byDate = new Map<string, typeof logs>();
    for (const log of logs) {
      const key = dateKey(log.date);
      byDate.set(key, [...(byDate.get(key) ?? []), log]);
    }

    const days = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      const dayLogs = byDate.get(key) ?? [];
      const filledUserIds = new Set(dayLogs.map((log) => log.userId));
      const filledCount = filledUserIds.size;
      const totalCount = users.length;
      const missingCount = Math.max(totalCount - filledCount, 0);
      const riskTotal = dayLogs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.risks), 0);
      const blockerTotal = dayLogs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.blockers), 0);
      const totalHours = dayLogs.reduce((sum, item) => sum + Number(item.hours), 0);
      days.push({
        date: key,
        filledCount,
        missingCount,
        remindCount: key <= today ? missingCount : 0,
        fillRate: totalCount === 0 ? 0 : Number(((filledCount / totalCount) * 100).toFixed(1)),
        riskCount: riskTotal,
        blockerCount: blockerTotal,
        totalHours: Number(totalHours.toFixed(2))
      });
    }

    return {
      month: query.month,
      scope,
      totalEmployees: users.length,
      days
    };
  }

  async calendarDay(user: CurrentUser, query: CalendarDayQueryDto) {
    const today = todayKeyInShanghai();
    const scope = this.access.resolveScope(user, query.scope, query.departmentId);
    const users = await this.prisma.user.findMany({
      where: {
        ...this.access.userWhere(user, scope.scope, scope.departmentId),
        requiresWorkReport: true
      },
      include: { department: true, roles: { where: { deletedAt: null }, include: { role: true } } },
      orderBy: [{ departmentId: "asc" }, { name: "asc" }]
    });
    const userIds = users.map((item) => item.id);
    const date = parseDateOnly(query.date);
    const logs = await this.prisma.workLog.findMany({
      where: {
        tenantId: user.tenantId,
        userId: { in: userIds },
        date,
        status: WorkLogStatus.SUBMITTED,
        deletedAt: null
      },
      include: {
        user: { include: { department: true } },
        project: true,
        aiAnalysis: true,
        attachments: {
          where: { deletedAt: null },
          select: {
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
          },
          orderBy: [{ createdAt: "asc" }]
        }
      },
      orderBy: [{ createdAt: "asc" }]
    });
    const logsByUser = new Map<string, typeof logs>();
    for (const log of logs) {
      logsByUser.set(log.userId, [...(logsByUser.get(log.userId) ?? []), log]);
    }
    const filledEmployees = users
      .filter((item) => logsByUser.has(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        departmentName: item.department?.name ?? null,
        logs: logsByUser.get(item.id) ?? []
      }));
    const missingEmployees = users
      .filter((item) => !logsByUser.has(item.id))
      .map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        phone: item.phone,
        departmentName: item.department?.name ?? null
      }));
    const totalHours = logs.reduce((sum, item) => sum + Number(item.hours), 0);
    const riskTotal = logs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.risks), 0);
    const blockerTotal = logs.reduce((sum, item) => sum + arrayCount(item.aiAnalysis?.blockers), 0);
    const remindCount = query.date <= today ? missingEmployees.length : 0;
    return {
      date: query.date,
      scope,
      filledEmployees,
      missingEmployees,
      stats: {
        totalEmployees: users.length,
        filledCount: filledEmployees.length,
        missingCount: missingEmployees.length,
        remindCount,
        fillRate: users.length === 0 ? 0 : Number(((filledEmployees.length / users.length) * 100).toFixed(1)),
        totalHours,
        riskCount: riskTotal,
        blockerCount: blockerTotal
      }
    };
  }
}
