"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Space, Tag, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, CheckCircle2, CreditCard, ShieldCheck, UsersRound } from "lucide-react";
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

const trialItems = ["1 个月免费试用", "包含 3 个成员席位", "日报、计划、AI 汇报全功能开放"];

const pricingPlans = [
  {
    name: "小团队版",
    price: "¥29",
    period: "/人/月",
    seats: "10 人以下",
    extra: "按实际成员数计费",
    annual: "适合先从小团队试用",
    description: "适合 1-9 人团队，低门槛使用日报、计划和 AI 汇报。"
  },
  {
    name: "团队版",
    price: "¥299",
    period: "/月",
    seats: "含 10 人",
    extra: "超出 ¥19/人/月",
    annual: "年付 ¥2,990",
    description: "适合小团队快速落地日报、计划和 AI 汇报。"
  },
  {
    name: "商业版",
    price: "¥999",
    period: "/月",
    seats: "含 50 人",
    extra: "超出 ¥15/人/月",
    annual: "年付 ¥9,990",
    description: "推荐给 20-200 人企业，覆盖部门管理和团队看板。",
    recommended: true
  },
  {
    name: "企业版",
    price: "¥2,999",
    period: "/月",
    seats: "含 200 人",
    extra: "超出 ¥12/人/月",
    annual: "年付 ¥29,990",
    description: "适合多部门企业，按席位扩容并支持更高服务量。"
  },
  {
    name: "私有化部署",
    price: "¥50,000",
    period: "/年起",
    seats: "按合同",
    extra: "专属部署与交付",
    annual: "按需报价",
    description: "适合数据敏感客户、内网部署或专属运维场景。"
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
      message.success("企业已创建，已进入 1 个月免费试用。");
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
          <div className="surface-panel flex flex-col justify-between p-7">
            <div>
              <Tag color="blue" className="mb-5">
                七数AI出品 · 订阅式服务 · 新企业免费试用
              </Tag>
              <Typography.Title className="!mb-4 !text-[34px] !font-medium !leading-tight">
                用日历管理团队日报，用 AI 生成可用汇报
              </Typography.Title>
              <Typography.Paragraph className="max-w-2xl !text-base !leading-7 !text-muted">
                员工填写日报和未来计划，管理者在月历中查看填报情况、风险和工时，AI 基于真实工作记录生成日报、周报和日历问答。
              </Typography.Paragraph>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <div className="metric-card">
                <CalendarCheck2 size={20} className="mb-3 text-primary" />
                <div className="metric-label">核心视图</div>
                <div className="mt-1 text-lg font-medium">月历看板</div>
              </div>
              <div className="metric-card">
                <UsersRound size={20} className="mb-3 text-secondary" />
                <div className="metric-label">试用席位</div>
                <div className="mt-1 text-lg font-medium">3 人免费使用</div>
              </div>
              <div className="metric-card">
                <CreditCard size={20} className="mb-3 text-warning" />
                <div className="metric-label">试用周期</div>
                <div className="mt-1 text-lg font-medium">1 个月</div>
              </div>
            </div>

            <div className="mt-6 rounded-[18px] bg-surface-container-low p-4">
              <div className="mb-3 text-sm font-medium text-ink">订阅说明</div>
              <div className="grid gap-2 md:grid-cols-3">
                {trialItems.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted">
                    <CheckCircle2 size={16} className="text-secondary" />
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs leading-5 text-muted">
                试用结束或超过 3 个席位后，可升级为团队版、商业版或企业版。第一版支持手动开通，后续可接入支付宝、微信支付或 Stripe。
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
              注册企业
            </Typography.Title>
            <Typography.Text className="text-muted">创建企业管理员账号，立即开始免费试用。</Typography.Text>
            {register.error ? <Alert className="mt-5" type="error" showIcon message={(register.error as Error).message} /> : null}
            <Form
              form={form}
              className="mt-6"
              layout="vertical"
              onFinish={(values) => register.mutate({ ...values, tenantCode: values.tenantCode.toLowerCase() })}
            >
              <Form.Item name="companyName" label="企业名称" rules={[{ required: true, min: 2 }]}>
                <Input placeholder="例如：星河科技有限公司" />
              </Form.Item>
              <Form.Item
                name="tenantCode"
                label="企业代码"
                extra="用于登录识别企业，只能包含小写字母、数字和中划线。"
                rules={[{ required: true, pattern: /^[a-z0-9-]{2,32}$/, message: "请输入 2-32 位小写字母、数字或中划线" }]}
              >
                <Input placeholder="acme" />
              </Form.Item>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <Form.Item name="adminName" label="管理员姓名" rules={[{ required: true, min: 2 }]}>
                  <Input placeholder="王明" />
                </Form.Item>
                <Form.Item name="adminEmail" label="管理员邮箱" rules={[{ required: true, type: "email" }]}>
                  <Input placeholder="admin@company.com" />
                </Form.Item>
              </div>
              <Form.Item name="password" label="登录密码" rules={[{ required: true, min: 6 }]}>
                <Input.Password placeholder="至少 6 位" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block icon={<ArrowRight size={16} />} loading={register.isPending}>
                免费试用 1 个月
              </Button>
            </Form>
          </div>
        </section>

        <section className="surface-panel bg-white p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Typography.Title level={3} className="!mb-1 !font-medium">
                订阅价格
              </Typography.Title>
              <Typography.Text className="text-muted">
                新企业 1 个月、3 人免费试用。试用后 10 人以下可按 ¥29/人/月使用，也可选择团队版、商业版或企业版。
              </Typography.Text>
            </div>
            <Tag color="green">年付约送 2 个月</Tag>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-[18px] border p-5 ${
                  plan.recommended
                    ? "border-primary bg-primary-container/60"
                    : "border-line bg-surface-container-low"
                }`}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-base font-medium text-ink">{plan.name}</div>
                  {plan.recommended ? <Tag color="blue">推荐</Tag> : null}
                </div>
                <div className="flex items-end gap-1">
                  <span className="text-[30px] font-semibold leading-9 text-ink">{plan.price}</span>
                  <span className="pb-1 text-sm text-muted">{plan.period}</span>
                </div>
                <div className="mt-3 space-y-2 text-sm text-muted">
                  <div>{plan.seats}</div>
                  <div>{plan.extra}</div>
                  <div>{plan.annual}</div>
                </div>
                <div className="mt-4 text-xs leading-5 text-muted">{plan.description}</div>
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
