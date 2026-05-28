import { BillingInterval, SubscriptionPlan } from "@prisma/client";

export type BillingPlanConfig = {
  plan: Exclude<SubscriptionPlan, "TRIAL">;
  name: string;
  description: string;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  recommendedSeats: number;
  features: string[];
};

export const activeMemberMonthlyPriceCents = 1900;

export type PaymentProviderConfig = {
  provider: "ALIPAY" | "WECHAT";
  enabled: boolean;
  mode: "mock" | "live";
  appId?: string;
  merchantId?: string;
  merchantSerialNo?: string;
  privateKey?: string;
  privateKeyPath?: string;
  apiV3Key?: string;
  platformSerialNo?: string;
  platformPublicKey?: string;
  platformPublicKeyPath?: string;
  notifyUrl?: string;
  returnUrl?: string;
};

export const billingPlans: BillingPlanConfig[] = [
  {
    plan: SubscriptionPlan.TEAM,
    name: "专业版",
    description: "¥19 / 启用成员 / 月，按企业内启用成员数量计费。",
    monthlyPriceCents: activeMemberMonthlyPriceCents,
    yearlyPriceCents: 0,
    recommendedSeats: 1,
    features: ["完整 AI 工作日历功能", "AI 日报、周报、月报", "AI 风险分析", "AI 工作问答", "日历看板", "项目管理", "数据导出", "可随时新增或停用成员"]
  }
];

export function planUnitPriceCents(plan: SubscriptionPlan, interval: BillingInterval) {
  const config = billingPlans.find((item) => item.plan === plan);
  if (!config) return 0;
  return interval === BillingInterval.YEARLY ? config.yearlyPriceCents : config.monthlyPriceCents;
}

export function getPaymentProviderConfigs(): PaymentProviderConfig[] {
  const mode = process.env.BILLING_PAYMENT_MODE === "live" ? "live" : "mock";
  const publicBaseUrl = process.env.PUBLIC_WEB_URL ?? process.env.WEB_BASE_URL ?? "http://localhost:3000";
  const apiBaseUrl = process.env.PUBLIC_API_URL ?? process.env.API_BASE_URL ?? "http://localhost:3001";
  return [
    {
      provider: "ALIPAY",
      mode,
      enabled: mode === "mock" || Boolean(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY),
      appId: process.env.ALIPAY_APP_ID,
      notifyUrl: process.env.ALIPAY_NOTIFY_URL ?? `${apiBaseUrl}/billing/payments/alipay/notify`,
      returnUrl: process.env.ALIPAY_RETURN_URL ?? `${publicBaseUrl}/org?tab=billing`
    },
    {
      provider: "WECHAT",
      mode,
      enabled:
        mode === "mock" ||
        Boolean(
          process.env.WECHAT_PAY_APP_ID &&
            process.env.WECHAT_PAY_MCH_ID &&
            process.env.WECHAT_PAY_API_V3_KEY &&
            process.env.WECHAT_PAY_MCH_SERIAL_NO &&
            (process.env.WECHAT_PAY_PRIVATE_KEY || process.env.WECHAT_PAY_PRIVATE_KEY_PATH) &&
            process.env.WECHAT_PAY_PLATFORM_SERIAL_NO &&
            (process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH)
        ),
      appId: process.env.WECHAT_PAY_APP_ID,
      merchantId: process.env.WECHAT_PAY_MCH_ID,
      merchantSerialNo: process.env.WECHAT_PAY_MCH_SERIAL_NO,
      privateKey: process.env.WECHAT_PAY_PRIVATE_KEY,
      privateKeyPath: process.env.WECHAT_PAY_PRIVATE_KEY_PATH,
      apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
      platformSerialNo: process.env.WECHAT_PAY_PLATFORM_SERIAL_NO,
      platformPublicKey: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY,
      platformPublicKeyPath: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH,
      notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL ?? `${apiBaseUrl}/billing/payments/wechat/notify`,
      returnUrl: process.env.WECHAT_PAY_RETURN_URL ?? `${publicBaseUrl}/org?tab=billing`
    }
  ];
}

export function getPaymentProviderConfig(provider: string) {
  return getPaymentProviderConfigs().find((item) => item.provider === provider);
}
