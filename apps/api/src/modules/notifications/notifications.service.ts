import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, WorkLogStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: CurrentUser) {
    await this.ensureTodayWorkLogReminder(user);
    return this.prisma.notification.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        deletedAt: null
      },
      orderBy: [{ createdAt: "desc" }],
      take: 50
    });
  }

  async read(user: CurrentUser, id: string) {
    const item = await this.prisma.notification.findFirst({
      where: { id, tenantId: user.tenantId, userId: user.id, deletedAt: null }
    });
    if (!item) {
      throw new NotFoundException("Notification not found");
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() }
    });
  }

  async readAll(user: CurrentUser) {
    await this.prisma.notification.updateMany({
      where: { tenantId: user.tenantId, userId: user.id, isRead: false, deletedAt: null },
      data: { isRead: true, readAt: new Date() }
    });
    return { ok: true };
  }

  private async ensureTodayWorkLogReminder(user: CurrentUser) {
    const account = await this.prisma.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId, deletedAt: null },
      select: { requiresWorkReport: true }
    });
    if (!account?.requiresWorkReport) {
      return;
    }
    const nowInShanghai = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const today = new Date(
      Date.UTC(nowInShanghai.getUTCFullYear(), nowInShanghai.getUTCMonth(), nowInShanghai.getUTCDate())
    );
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const submittedCount = await this.prisma.workLog.count({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        date: today,
        status: WorkLogStatus.SUBMITTED,
        deletedAt: null
      }
    });
    if (submittedCount > 0) {
      return;
    }
    const existing = await this.prisma.notification.findFirst({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        type: NotificationType.WORK_LOG_REMINDER,
        createdAt: { gte: today, lt: tomorrow },
        deletedAt: null
      }
    });
    if (existing) {
      return;
    }
    await this.prisma.notification.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        type: NotificationType.WORK_LOG_REMINDER,
        title: "今日未填报提醒",
        body: "今天还没有提交工作填报。",
        data: { date: today.toISOString().slice(0, 10) }
      }
    });
  }
}
