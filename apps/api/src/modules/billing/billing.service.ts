import { BadRequestException, Injectable } from "@nestjs/common";
import { BillingInterval, BillingOrderStatus, PaymentProvider, PaymentStatus, Prisma, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { SubscriptionService } from "../../common/subscription/subscription.service";
import { CurrentUser } from "../../common/types/current-user";
import { ConfirmManualPaymentDto, CreateBillingOrderDto } from "./dto/order.dto";
import { billingPlans, getPaymentProviderConfig, getPaymentProviderConfigs, planUnitPriceCents } from "./payment.config";
import { UpdateSubscriptionDto } from "./dto/update-subscription.dto";
import { WechatPayService } from "./wechat-pay.service";

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateOnly(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addPeriodFrom(date: Date, interval: BillingInterval) {
  const result = new Date(date);
  if (interval === BillingInterval.YEARLY) {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  } else {
    result.setUTCMonth(result.getUTCMonth() + 1);
  }
  return dateOnly(result);
}

function addPeriod(interval: BillingInterval) {
  return addPeriodFrom(new Date(), interval);
}

function dateKey(date: Date) {
  return dateOnly(date).toISOString().slice(0, 10);
}

function metadataObject(value: Prisma.JsonValue | null | undefined) {
  return typeof value === "object" && value && !Array.isArray(value) ? (value as Prisma.JsonObject) : {};
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly subscriptions: SubscriptionService,
    private readonly audit: AuditService,
    private readonly wechatPay: WechatPayService
  ) {}

  getCurrentSubscription(user: CurrentUser) {
    return this.subscriptions.getSubscriptionSummary(user.tenantId);
  }

  getPlans() {
    return {
      currency: "CNY",
      plans: billingPlans,
      billingPolicy: {
        model: "ACTIVE_MEMBER_MONTHLY",
        trialDays: 30,
        trialUnlimitedMembers: true,
        activeMemberMonthlyPriceCents: planUnitPriceCents(SubscriptionPlan.TEAM, BillingInterval.MONTHLY),
        copy: "企业免费试用1个月，正式使用 ¥19 / 启用成员 / 月。"
      },
      paymentProviders: getPaymentProviderConfigs().map((item) => ({
        provider: item.provider,
        enabled: item.enabled,
        mode: item.mode
      }))
    };
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
    const plan = dto.plan ?? SubscriptionPlan.TEAM;
    const interval = dto.interval ?? BillingInterval.MONTHLY;
    if (plan !== SubscriptionPlan.TEAM || interval !== BillingInterval.MONTHLY) {
      throw new BadRequestException("当前仅支持专业版按月订阅");
    }
    const unitPriceCents = planUnitPriceCents(plan, interval);
    if (unitPriceCents <= 0) {
      throw new BadRequestException("Invalid billing plan");
    }
    const activeMemberCount = await this.countActiveMembers(user.tenantId);
    const billedMemberCount = Math.max(1, activeMemberCount);
    const amountCents = unitPriceCents * billedMemberCount;
    const providerConfig = getPaymentProviderConfig(dto.provider);
    if (dto.provider !== PaymentProvider.MANUAL && (!providerConfig || !providerConfig.enabled)) {
      throw new BadRequestException(`${dto.provider} payment is not configured`);
    }
    const baseMetadata: Prisma.InputJsonObject = {
      billingModel: "ACTIVE_MEMBER_MONTHLY",
      unitPriceCents,
      activeMemberCount,
      billedMemberCount,
      subscriptionPeriodPreview: this.subscriptionPeriodFrom(new Date(), interval)
    };
    const order = await this.prisma.billingOrder.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.id,
        plan,
        interval,
        seatLimit: billedMemberCount,
        amountCents,
        provider: dto.provider,
        expiresAt: addPeriod(BillingInterval.MONTHLY),
        metadata: baseMetadata
      },
      include: { payments: true }
    });
    if (dto.provider !== PaymentProvider.MANUAL) {
      const onlinePayment = await this.createPaymentSession(dto.provider, amountCents, order);
      if (!onlinePayment) {
        throw new BadRequestException(`${dto.provider} payment is not supported`);
      }
      await this.prisma.$transaction([
        this.prisma.billingOrder.update({
          where: { id: order.id },
          data: {
            paymentUrl: onlinePayment.paymentUrl ?? null,
            metadata: { ...baseMetadata, payment: onlinePayment } as Prisma.InputJsonObject
          }
        }),
        this.prisma.paymentRecord.create({
          data: {
            tenantId: user.tenantId,
            orderId: order.id,
            provider: dto.provider,
            status: PaymentStatus.PENDING,
            amountCents,
            currency: order.currency,
            transactionId: onlinePayment.transactionId,
            raw: onlinePayment
          }
        })
      ]);
    }
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "BILLING_ORDER_CREATED",
      targetType: "BillingOrder",
      targetId: order.id,
      metadata: { plan, interval, activeMemberCount, billedMemberCount, unitPriceCents, amountCents, provider: dto.provider }
    });
    return this.prisma.billingOrder.findFirst({ where: { id: order.id }, include: { payments: true } });
  }

  async getOrderPayment(user: CurrentUser, orderId: string) {
    const order = await this.getTenantOrder(user, orderId);
    const rawPayment =
      typeof order.metadata === "object" && order.metadata && !Array.isArray(order.metadata)
        ? (order.metadata as { payment?: unknown }).payment
        : null;
    return {
      order,
      subscriptionPeriod: this.resolveOrderSubscriptionPeriod(order),
      payment:
        rawPayment ??
        (order.paymentUrl
          ? {
              provider: order.provider,
              paymentUrl: order.paymentUrl,
              qrCodeText: order.paymentUrl
            }
          : null)
    };
  }

  async confirmOnlinePayment(user: CurrentUser, orderId: string) {
    const order = await this.getTenantOrder(user, orderId);
    if (order.status !== BillingOrderStatus.PENDING) {
      return order;
    }
    if (order.provider !== PaymentProvider.ALIPAY && order.provider !== PaymentProvider.WECHAT) {
      throw new BadRequestException("Only Alipay or WeChat Pay orders can be confirmed here");
    }
    const providerConfig = getPaymentProviderConfig(order.provider);
    if (providerConfig?.mode === "live") {
      throw new BadRequestException("Live payments must be confirmed by provider callback");
    }
    return this.applyPaidOrder(user.id, order, order.provider, `mock-paid-${order.id}`, { mode: "mock" });
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
    if (order.status !== BillingOrderStatus.PENDING) {
      return this.prisma.billingOrder.findFirst({ where: { id: order.id }, include: { payments: true } });
    }
    return this.applyPaidOrder(user.id, order, PaymentProvider.MANUAL, dto.transactionId ?? `manual-${order.id}`, { manual: true });
  }

  async handleWechatNotify(rawBody: string, headers: Record<string, string | string[] | undefined>) {
    const transaction = this.wechatPay.parseNotify(rawBody, headers);
    const order = await this.prisma.billingOrder.findFirst({
      where: {
        id: transaction.out_trade_no,
        provider: PaymentProvider.WECHAT,
        deletedAt: null
      }
    });
    if (!order) {
      throw new BadRequestException("Order not found");
    }
    if (transaction.amount?.total !== order.amountCents || (transaction.amount.currency ?? "CNY") !== order.currency) {
      await this.prisma.paymentRecord.updateMany({
        where: { orderId: order.id, provider: PaymentProvider.WECHAT, status: PaymentStatus.PENDING },
        data: {
          status: PaymentStatus.FAILED,
          raw: { reason: "AMOUNT_MISMATCH", transaction } as Prisma.InputJsonObject
        }
      });
      throw new BadRequestException("微信支付金额与订单金额不一致。");
    }
    if (order.status === BillingOrderStatus.PAID) {
      return order;
    }
    return this.applyPaidOrder(
      null,
      order,
      PaymentProvider.WECHAT,
      transaction.transaction_id ?? transaction.out_trade_no,
      { transaction } as Prisma.InputJsonObject
    );
  }

  private async createPaymentSession(
    provider: PaymentProvider,
    amountCents: number,
    order: { id: string; tenantId: string; plan: SubscriptionPlan; interval: BillingInterval; seatLimit: number; amountCents: number; currency: string }
  ) {
    if (provider === PaymentProvider.MANUAL) {
      return null;
    }
    const providerConfig = getPaymentProviderConfig(provider);
    if (provider === PaymentProvider.WECHAT && providerConfig?.mode === "live") {
      return this.wechatPay.createNativeOrder({
        orderId: order.id,
        description: "Work Calendar AI 专业版订阅",
        amountCents,
        currency: order.currency,
        attach: order.tenantId
      });
    }
    const transactionId = `${provider.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const paymentUrl =
      providerConfig?.mode === "live"
        ? `${providerConfig.returnUrl ?? "https://work-calendar-ai.local/pay"}?provider=${provider}&tradeNo=${transactionId}`
        : `work-calendar-ai://mock-pay/${provider.toLowerCase()}?tradeNo=${transactionId}&amount=${amountCents}`;
    return {
      provider,
      mode: providerConfig?.mode ?? "mock",
      paymentUrl,
      qrCodeText: paymentUrl,
      transactionId,
      amountCents,
      notifyUrl: providerConfig?.notifyUrl ?? null,
      returnUrl: providerConfig?.returnUrl ?? null
    };
  }

  private countActiveMembers(tenantId: string) {
    return this.prisma.user.count({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null
      }
    });
  }

  private async getTenantOrder(user: CurrentUser, orderId: string) {
    const order = await this.prisma.billingOrder.findFirst({
      where: { id: orderId, tenantId: user.tenantId, deletedAt: null },
      include: { payments: true }
    });
    if (!order) {
      throw new BadRequestException("Order not found");
    }
    if (!this.access.isCompanyAdmin(user)) {
      throw new BadRequestException("Only company admins can access billing orders");
    }
    return order;
  }

  private async applyPaidOrder(
    actorUserId: string | null,
    order: {
      id: string;
      tenantId: string;
      plan: SubscriptionPlan;
      interval: BillingInterval;
      seatLimit: number;
      amountCents: number;
      currency: string;
      metadata?: Prisma.JsonValue | null;
    },
    provider: PaymentProvider,
    transactionId: string,
    raw: Prisma.InputJsonValue
  ) {
    const periodStart = dateOnly();
    const periodEnd = addPeriodFrom(periodStart, order.interval);
    const subscriptionPeriod = this.subscriptionPeriodFrom(periodStart, order.interval);
    const orderMetadata = metadataObject(order.metadata);
    await this.prisma.$transaction(async (tx) => {
      await tx.billingOrder.update({
        where: { id: order.id },
        data: {
          status: BillingOrderStatus.PAID,
          paidAt: new Date(),
          metadata: { ...orderMetadata, subscriptionPeriod } as Prisma.InputJsonObject
        }
      });
      const pending = await tx.paymentRecord.updateMany({
        where: {
          orderId: order.id,
          provider,
          status: PaymentStatus.PENDING
        },
        data: {
          status: PaymentStatus.SUCCEEDED,
          transactionId,
          raw
        }
      });
      if (pending.count === 0) {
        await tx.paymentRecord.create({
          data: {
            tenantId: order.tenantId,
            orderId: order.id,
            provider,
            status: PaymentStatus.SUCCEEDED,
            amountCents: order.amountCents,
            currency: order.currency,
            transactionId,
            raw
          }
        });
      }
      await tx.subscription.upsert({
        where: { tenantId: order.tenantId },
        update: {
          plan: order.plan,
          status: SubscriptionStatus.ACTIVE,
          seatLimit: order.seatLimit,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          provider
        },
        create: {
          tenantId: order.tenantId,
          plan: order.plan,
          status: SubscriptionStatus.ACTIVE,
          seatLimit: order.seatLimit,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          provider
        }
      });
    });
    await this.audit.log({
      tenantId: order.tenantId,
      actorUserId,
      action: provider === PaymentProvider.MANUAL ? "BILLING_MANUAL_PAYMENT_CONFIRMED" : "BILLING_ONLINE_PAYMENT_CONFIRMED",
      targetType: "BillingOrder",
      targetId: order.id,
      metadata: { transactionId, provider, subscriptionPeriod }
    });
    return this.prisma.billingOrder.findFirst({ where: { id: order.id }, include: { payments: true } });
  }

  private subscriptionPeriodFrom(start: Date, interval: BillingInterval) {
    const periodStart = dateOnly(start);
    return {
      startDate: dateKey(periodStart),
      endDate: dateKey(addPeriodFrom(periodStart, interval))
    };
  }

  private resolveOrderSubscriptionPeriod(order: {
    status: BillingOrderStatus;
    interval: BillingInterval;
    paidAt?: Date | null;
    metadata?: Prisma.JsonValue | null;
  }) {
    const metadata = metadataObject(order.metadata);
    const savedPeriod = metadata.subscriptionPeriod;
    if (
      typeof savedPeriod === "object" &&
      savedPeriod &&
      !Array.isArray(savedPeriod) &&
      typeof savedPeriod.startDate === "string" &&
      typeof savedPeriod.endDate === "string"
    ) {
      return {
        startDate: savedPeriod.startDate,
        endDate: savedPeriod.endDate
      };
    }
    const start = order.status === BillingOrderStatus.PAID && order.paidAt ? order.paidAt : new Date();
    return this.subscriptionPeriodFrom(start, order.interval);
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
