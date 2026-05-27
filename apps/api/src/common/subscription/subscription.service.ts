import { BadRequestException, Injectable } from "@nestjs/common";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

const activeStatuses: SubscriptionStatus[] = [SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE];
const activeMemberMonthlyPriceCents = 1900;

function addMonths(months: number) {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + months);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultSubscription(tenantId: string) {
    return this.prisma.subscription.upsert({
      where: { tenantId },
      update: { deletedAt: null },
      create: {
        tenantId,
        plan: SubscriptionPlan.TRIAL,
        status: SubscriptionStatus.TRIALING,
        seatLimit: 0,
        currentPeriodStart: dateOnly(),
        currentPeriodEnd: addMonths(1),
        trialEndsAt: addMonths(1)
      }
    });
  }

  async getSubscriptionSummary(tenantId: string) {
    const subscription = await this.ensureDefaultSubscription(tenantId);
    const usedSeats = await this.prisma.user.count({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null
      }
    });
    const estimatedMonthlyAmountCents = usedSeats * activeMemberMonthlyPriceCents;
    const isTrialing = subscription.status === SubscriptionStatus.TRIALING;
    return {
      ...subscription,
      usedSeats,
      remainingSeats: null,
      isUsable: this.isUsable(subscription.status, subscription.currentPeriodEnd),
      billingModel: "ACTIVE_MEMBER_MONTHLY",
      activeMemberMonthlyPriceCents,
      estimatedMonthlyAmountCents,
      trialUnlimited: isTrialing
    };
  }

  async assertCanAddActiveUser(tenantId: string, _extraSeats = 1) {
    const summary = await this.getSubscriptionSummary(tenantId);
    if (!summary.isUsable) {
      throw new BadRequestException("当前企业订阅不可用，请续费或联系平台管理员。");
    }
  }

  private isUsable(status: SubscriptionStatus, currentPeriodEnd: Date | null) {
    if (!activeStatuses.includes(status)) return false;
    if (!currentPeriodEnd) return true;
    return currentPeriodEnd >= dateOnly();
  }
}
