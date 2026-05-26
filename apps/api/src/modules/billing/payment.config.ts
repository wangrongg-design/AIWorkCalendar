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

export type PaymentProviderConfig = {
  provider: "ALIPAY" | "WECHAT";
  enabled: boolean;
  mode: "mock" | "live";
  appId?: string;
  merchantId?: string;
  notifyUrl?: string;
  returnUrl?: string;
};

export const billingPlans: BillingPlanConfig[] = [
  {
    plan: SubscriptionPlan.TEAM,
    name: "专业版",
    description: "适合正式团队协作使用，一个团队每月 299。",
    monthlyPriceCents: 29900,
    yearlyPriceCents: 299000,
    recommendedSeats: 20,
    features: ["免费版全部功能", "更多成员容量", "更高 AI 使用额度", "完整历史数据", "团队管理", "数据导出", "适合中小企业团队长期使用"]
  },
  {
    plan: SubscriptionPlan.ENTERPRISE,
    name: "企业版",
    description: "适合需要私有化部署、安全合规和专属支持的企业。",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    recommendedSeats: 100,
    features: ["专业版全部功能", "私有化部署", "API 接入", "SSO / LDAP", "审计日志", "专属部署与运维支持", "本地模型或专属模型支持"]
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
      enabled: mode === "mock" || Boolean(process.env.WECHAT_PAY_MCH_ID && process.env.WECHAT_PAY_API_V3_KEY),
      appId: process.env.WECHAT_PAY_APP_ID,
      merchantId: process.env.WECHAT_PAY_MCH_ID,
      notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL ?? `${apiBaseUrl}/billing/payments/wechat/notify`,
      returnUrl: process.env.WECHAT_PAY_RETURN_URL ?? `${publicBaseUrl}/org?tab=billing`
    }
  ];
}

export function getPaymentProviderConfig(provider: string) {
  return getPaymentProviderConfigs().find((item) => item.provider === provider);
}
