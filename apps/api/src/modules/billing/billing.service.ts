import { BadRequestException, Injectable } from "@nestjs/common";
import { BillingInterval, BillingOrderStatus, PaymentProvider, PaymentStatus, Prisma, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { SubscriptionService } from "../../common/subscription/subscription.service";
import { CurrentUser } from "../../common/types/current-user";
import { ConfirmManualPaymentDto, CreateBillingOrderDto } from "./dto/order.dto";
import { UpdateSubscriptionDto } from "./dto/update-subscription.dto";

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addPeriod(interval: BillingInterval) {
  const date = new Date();
  if (interval === BillingInterval.YEARLY) {
    date.setUTCFullYear(date.getUTCFullYear() + 1);
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return dateOnly(date);
}

function planUnitPriceCents(plan: SubscriptionPlan, interval: BillingInterval) {
  const monthly = {
    [SubscriptionPlan.TRIAL]: 0,
    [SubscriptionPlan.TEAM]: 3900,
    [SubscriptionPlan.BUSINESS]: 9900,
    [SubscriptionPlan.ENTERPRISE]: 29900
  }[plan];
  return interval === BillingInterval.YEARLY ? Math.round(monthly * 10) : monthly;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly subscriptions: SubscriptionService,
    private readonly audit: AuditService
  ) {}

  getCurrentSubscription(user: CurrentUser) {
    return this.subscriptions.getSubscriptionSummary(user.tenantId);
  }

  async updateCurrentSubscription(user: CurrentUser, dto: UpdateSubscriptionDto) {
    if (!this.access.isSuperAdmin(user)) {
      throw new BadRequestException("Only platform super admins can update subscriptions");
    }
    return this.updateSubscription(user.tenantId, dto);
  }

  async updateTenantSubscription(user: CurrentUser, tenantId: string, dto: UpdateSubscriptionDto) {
    if (!this.access.isSuperAdmin(user)) {
      throw new BadRequestException("Only platform super admins can update subscriptions");
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true }
    });
    if (!tenant) {
      throw new BadRequestException("Tenant not found");
    }
    return this.updateSubscription(tenantId, dto);
  }

  async listOrders(user: CurrentUser) {
    return this.prisma.billingOrder.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ createdAt: "desc" }],
      take: 50,
      include: { payments: true }
    });
  }

  async createOrder(user: CurrentUser, dto: CreateBillingOrderDto) {
    if (!this.access.isCompanyAdmin(user)) {
      throw new BadRequestException("Only company admins can create billing orders");
    }
    const amountCents = planUnitPriceCents(dto.plan, dto.interval) * dto.seatLimit;
    const order = await this.prisma.billingOrder.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.id,
        plan: dto.plan,
        interval: dto.interval,
        seatLimit: dto.seatLimit,
        amountCents,
        provider: dto.provider,
        expiresAt: addPeriod(BillingInterval.MONTHLY),
        paymentUrl: dto.provider === PaymentProvider.MANUAL ? null : "PAYMENT_PROVIDER_NOT_CONFIGURED"
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "BILLING_ORDER_CREATED",
      targetType: "BillingOrder",
      targetId: order.id,
      metadata: { plan: dto.plan, interval: dto.interval, seatLimit: dto.seatLimit, amountCents }
    });
    return order;
  }

  async confirmManualPayment(user: CurrentUser, orderId: string, dto: ConfirmManualPaymentDto) {
    if (!this.access.isSuperAdmin(user)) {
      throw new BadRequestException("Only platform super admins can confirm manual payments");
    }
    const order = await this.prisma.billingOrder.findFirst({
      where: { id: orderId, deletedAt: null }
    });
    if (!order) {
      throw new BadRequestException("Order not found");
    }
    const periodEnd = addPeriod(order.interval);
    await this.prisma.$transaction([
      this.prisma.billingOrder.update({
        where: { id: order.id },
        data: { status: BillingOrderStatus.PAID, paidAt: new Date() }
      }),
      this.prisma.paymentRecord.create({
        data: {
          tenantId: order.tenantId,
          orderId: order.id,
          provider: PaymentProvider.MANUAL,
          status: PaymentStatus.SUCCEEDED,
          amountCents: order.amountCents,
          currency: order.currency,
          transactionId: dto.transactionId ?? `manual-${order.id}`
        }
      }),
      this.prisma.subscription.upsert({
        where: { tenantId: order.tenantId },
        update: {
          plan: order.plan,
          status: SubscriptionStatus.ACTIVE,
          seatLimit: order.seatLimit,
          currentPeriodStart: dateOnly(),
          currentPeriodEnd: periodEnd,
          provider: PaymentProvider.MANUAL
        },
        create: {
          tenantId: order.tenantId,
          plan: order.plan,
          status: SubscriptionStatus.ACTIVE,
          seatLimit: order.seatLimit,
          currentPeriodStart: dateOnly(),
          currentPeriodEnd: periodEnd,
          provider: PaymentProvider.MANUAL
        }
      })
    ]);
    await this.audit.log({
      tenantId: order.tenantId,
      actorUserId: user.id,
      action: "BILLING_MANUAL_PAYMENT_CONFIRMED",
      targetType: "BillingOrder",
      targetId: order.id,
      metadata: { transactionId: dto.transactionId ?? null }
    });
    return this.prisma.billingOrder.findFirst({ where: { id: order.id }, include: { payments: true } });
  }

  private async updateSubscription(tenantId: string, dto: UpdateSubscriptionDto) {
    await this.subscriptions.ensureDefaultSubscription(tenantId);
    const data: Prisma.SubscriptionUpdateInput = {
      plan: dto.plan,
      status: dto.status,
      seatLimit: dto.seatLimit,
      currentPeriodEnd: dto.currentPeriodEnd ? parseDateOnly(dto.currentPeriodEnd) : undefined,
      trialEndsAt: dto.trialEndsAt ? parseDateOnly(dto.trialEndsAt) : undefined,
      provider: dto.provider,
      externalCustomerId: dto.externalCustomerId,
      externalSubscriptionId: dto.externalSubscriptionId
    };
    if (dto.status === SubscriptionStatus.CANCELED) {
      data.canceledAt = new Date();
    } else if (dto.status) {
      data.canceledAt = null;
    }
    if (dto.status === SubscriptionStatus.ACTIVE && !dto.currentPeriodEnd) {
      data.currentPeriodStart = dateOnly();
    }
    await this.prisma.subscription.update({
      where: { tenantId },
      data
    });
    await this.audit.log({
      tenantId,
      actorUserId: null,
      action: "SUBSCRIPTION_UPDATED",
      targetType: "Subscription",
      targetId: tenantId,
      metadata: { ...dto } as Prisma.InputJsonObject
    });
    return this.subscriptions.getSubscriptionSummary(tenantId);
  }
}
