"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Space, Tag, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, CheckCircle2, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AuthUser } from "@/lib/types";

type RegisterForm = {
  companyName: string;
  tenantCode: string;
  adminName: string;
  adminEmail: string;
  password: string;
};

type RegisterResponse = {
  accessToken: string;
  user: AuthUser;
};

const productCapabilities = [
  "AI 自动生成日报、周报、月报",
  "AI 自动分析团队风险和项目阻塞",
  "管理者可在日历中查看团队状态",
  "工作记录自动沉淀为企业知识"
];

const aiInsightExamples = [
  "本周团队填报率较上周提升 18%",
  "研发项目存在 1 个延期风险",
  "AI 已为团队生成本周工作摘要"
];

const pricingPlans = [
  {
    name: "免费版",
    price: "¥0",
    description: "3人以内永久免费，完整体验 AI 工作能力。",
    features: ["完整 AI 日报、周报、月报", "AI 风险分析", "AI 工作问答", "日历看板", "项目管理", "3人以内", "适合小团队试用"],
    note: "适合体验和小团队早期使用",
    cta: "免费创建团队"
  },
  {
    name: "专业版",
    price: "¥299",
    period: "/月",
    badge: "推荐",
    description: "适合正式团队协作使用，一个团队每月 299。",
    features: ["免费版全部功能", "更多成员容量", "更高 AI 使用额度", "完整历史数据", "团队管理", "数据导出", "适合中小企业团队长期使用"],
    cta: "升级专业版",
    recommended: true
  },
  {
    name: "企业版",
    price: "联系销售",
    description: "适合需要私有化部署、安全合规和专属支持的企业。",
    features: ["专业版全部功能", "私有化部署", "API 接入", "SSO / LDAP", "审计日志", "专属部署与运维支持", "本地模型或专属模型支持"],
    cta: "联系销售"
  }
];

export default function HomePage() {
  const router = useRouter();
  const [form] = Form.useForm<RegisterForm>();
  const token = useAuthStore((state) => state.token);
  const setSession = useAuthStore((state) => state.setSession);

  const register = useMutation({
    mutationFn: (values: RegisterForm) =>
      apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
      message.success("企业已创建，已进入 AI 工作空间。");
      router.replace("/dashboard");
    }
  });

  return (
    <main className="min-h-screen bg-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-5 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-[96px] items-center">
              <img src="/seven-ai-logo.png" alt="七数AI" className="h-8 w-full object-contain opacity-80" />
            </div>
            <div>
              <Typography.Title level={4} className="!m-0 !font-medium">
                Work Calendar AI
              </Typography.Title>
              <Typography.Text className="text-muted">北京七数智联科技有限公司</Typography.Text>
            </div>
          </div>
          <Space>
            {token ? (
              <Button type="primary" onClick={() => router.push("/dashboard")}>
                进入系统
              </Button>
            ) : (
              <Button onClick={() => router.push("/login")}>已有账号登录</Button>
            )}
          </Space>
        </header>

        <section className="grid items-stretch gap-5 lg:grid-cols-[1fr_440px]">
          <div className="register-value-panel flex flex-col justify-between p-7">
            <div>
              <Tag color="blue" className="mb-5">
                Work Calendar AI · AI 工作操作系统
              </Tag>
              <Typography.Title className="register-value-title">
                AI 自动理解团队工作，而不只是收集日报
              </Typography.Title>
              <div className="register-value-english">Your AI-powered team operating system.</div>
              <Typography.Paragraph className="register-value-copy">
                用日历管理日报与计划，用 AI 自动生成汇报、发现风险、沉淀团队知识。
              </Typography.Paragraph>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {productCapabilities.map((item) => (
                <div key={item} className="register-capability-card">
                  <CheckCircle2 size={17} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="register-ai-insight mt-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <CalendarCheck2 size={17} className="text-primary" />
                AI 工作洞察
              </div>
              <div className="space-y-2">
                {aiInsightExamples.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted">
                    <CheckCircle2 size={15} className="text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 rounded-[18px] bg-surface-container-low p-4">
              <div className="mb-3 text-sm font-medium text-ink">降低团队使用成本</div>
              <div className="grid gap-2 md:grid-cols-3">
                {["3人以内永久免费", "完整功能开放", "正式团队每月299"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted">
                    <CheckCircle2 size={16} className="text-secondary" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex gap-3 rounded-[18px] bg-white p-4 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-secondary-container text-secondary">
                <ShieldCheck size={18} />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">所有企业数据均保密</div>
                <div className="mt-1 text-xs leading-5 text-muted">
                  数据按企业租户隔离保存。企业管理员可以随时导出全量备份，用于留存、迁移或停止使用系统后的数据交接。
                </div>
              </div>
            </div>
          </div>

          <div className="surface-panel bg-white p-7">
            <Typography.Title level={3} className="!mb-1 !font-medium">
              免费创建团队
            </Typography.Title>
            <Typography.Text className="text-muted">创建企业管理员账号，进入你的 AI 工作空间。</Typography.Text>
            {register.error ? <Alert className="mt-5" type="error" showIcon message={(register.error as Error).message} /> : null}
            <Form
              form={form}
              className="register-form mt-6"
              layout="vertical"
              onFinish={(values) => register.mutate({ ...values, tenantCode: values.tenantCode.toLowerCase() })}
            >
              <Form.Item className="register-priority-field" name="companyName" label="企业名称" rules={[{ required: true, min: 2 }]}>
                <Input placeholder="例如：星河科技有限公司" />
              </Form.Item>
              <Form.Item
                name="tenantCode"
                label="企业代码"
                extra="用于团队成员登录识别，可使用公司简称或拼音。"
                rules={[{ required: true, pattern: /^[a-z0-9-]{2,32}$/, message: "请输入 2-32 位小写字母、数字或中划线" }]}
              >
                <Input placeholder="acme" />
              </Form.Item>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Form.Item name="adminName" label="管理员姓名" rules={[{ required: true, min: 2 }]}>
                  <Input placeholder="王明" />
                </Form.Item>
                <Form.Item className="register-priority-field" name="adminEmail" label="管理员邮箱" rules={[{ required: true, type: "email" }]}>
                  <Input placeholder="admin@company.com" />
                </Form.Item>
              </div>
              <Form.Item className="register-priority-field" name="password" label="登录密码" rules={[{ required: true, min: 6 }]}>
                <Input.Password placeholder="至少 6 位" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block icon={<ArrowRight size={16} />} loading={register.isPending}>
                免费创建团队
              </Button>
            </Form>
          </div>
        </section>

        <section className="surface-panel bg-white p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Typography.Title level={3} className="!mb-1 !font-medium">
                套餐价格
              </Typography.Title>
              <Typography.Text className="text-muted">
                免费版和专业版都开放完整功能，差异只体现在人数、AI额度、数据保留和企业服务上。
              </Typography.Text>
            </div>
            <Tag color="green">免费版：3人以内永久免费</Tag>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`pricing-card ${
                  plan.recommended
                    ? "is-recommended"
                    : ""
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-base font-medium text-ink">{plan.name}</div>
                  {plan.badge ? <Tag color="blue">{plan.badge}</Tag> : null}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-[30px] font-semibold leading-9 text-ink">{plan.price}</span>
                  {"period" in plan ? <span className="pb-1 text-sm text-muted">{plan.period}</span> : null}
                </div>
                <div className="mt-3 min-h-12 text-sm leading-6 text-muted">{plan.description}</div>
                <div className="mt-4 space-y-2">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm text-muted">
                      <CheckCircle2 size={15} className="text-success" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                {"note" in plan ? <div className="mt-4 text-xs leading-5 text-warning">{plan.note}</div> : null}
                <Button
                  className="mt-5"
                  type={plan.recommended ? "primary" : "default"}
                  block
                  onClick={() => {
                    if (plan.name === "企业版") {
                      message.info("请联系销售获取企业版方案。");
                      return;
                    }
                    form.submit();
                  }}
                >
                  {plan.cta}
                </Button>
              </div>
            ))}
          </div>
        </section>

        <footer className="surface-panel flex flex-wrap items-center justify-between gap-4 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-[88px] items-center">
              <img src="/seven-ai-logo.png" alt="七数AI" className="h-7 w-full object-contain opacity-70" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink">开发公司：北京七数智联科技有限公司</div>
              <div className="mt-1 text-xs text-muted">提供系统研发、AI 能力接入、部署交付和持续运维支持。</div>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
