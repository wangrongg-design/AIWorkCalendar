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
    name: "团队版",
    description: "适合小团队统一管理日报、计划和 AI 汇报。",
    monthlyPriceCents: 3900,
    yearlyPriceCents: 39000,
    recommendedSeats: 5,
    features: ["月历填报统计", "AI 日报分析", "个人/部门报告", "基础数据导出"]
  },
  {
    plan: SubscriptionPlan.BUSINESS,
    name: "商业版",
    description: "适合多部门协作和管理层按部门查看风险。",
    monthlyPriceCents: 9900,
    yearlyPriceCents: 99000,
    recommendedSeats: 20,
    features: ["团队版全部能力", "部门维度统计", "审计日志", "异步备份导出"]
  },
  {
    plan: SubscriptionPlan.ENTERPRISE,
    name: "企业版",
    description: "适合需要更高席位上限和企业级交付支持的组织。",
    monthlyPriceCents: 29900,
    yearlyPriceCents: 299000,
    recommendedSeats: 50,
    features: ["商业版全部能力", "企业级席位", "专属部署支持", "支付与数据治理扩展"]
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
