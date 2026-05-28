"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Tag, message } from "antd";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AuthUser } from "@/lib/types";
import { normalizeUnifiedSocialCreditCode, unifiedSocialCreditCodeMessage, unifiedSocialCreditCodePattern } from "@/lib/unified-social-credit-code";

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

const navItems = [
  { label: "产品", href: "#product" },
  { label: "价格", href: "#pricing" },
  { label: "安全", href: "#security" }
];

const highlights = [
  { label: "AI 日报", value: "自动生成" },
  { label: "团队风险", value: "提前发现" },
  { label: "管理视图", value: "日历呈现" }
];

const productTiles = [
  { day: "Mon", title: "已填报", tone: "quiet" },
  { day: "Tue", title: "AI汇总", tone: "ai" },
  { day: "Wed", title: "风险", tone: "risk" },
  { day: "Thu", title: "计划", tone: "quiet" },
  { day: "Fri", title: "周报", tone: "ai" }
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
      router.replace("/calendar");
    }
  });

  const scrollToSignup = () => {
    document.getElementById("signup")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="premium-home" id="top">
      <header className="premium-nav">
        <a className="premium-brand" href="#top" aria-label="七数AI Work Calendar AI 官网首页">
          <img src="/seven-ai-logo.png" alt="七数AI" />
          <span>Work Calendar AI</span>
        </a>
        <nav aria-label="官网导航">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="premium-nav-actions">
          <Button icon={<LogIn size={16} />} onClick={() => router.push(token ? "/calendar" : "/login")}>
            {token ? "进入工作台" : "已有账号登录"}
          </Button>
          <Button type="primary" icon={<ArrowRight size={16} />} onClick={scrollToSignup}>
            免费试用
          </Button>
        </div>
      </header>

      <section className="premium-hero">
        <div className="premium-kicker">
          <Sparkles size={16} />
          AI Work Calendar
        </div>
        <h1>让团队工作，自动成文。</h1>
        <p>
          <span>日报、计划、项目和风险。</span>
          <span>汇成一张智能日历。</span>
        </p>
        <div className="premium-hero-actions">
          <Button type="primary" size="large" icon={<ArrowRight size={18} />} onClick={scrollToSignup}>
            免费创建企业
          </Button>
          <Button size="large" icon={<LogIn size={18} />} onClick={() => router.push("/login")}>
            已有账号登录
          </Button>
        </div>
        <div className="premium-price-line">
          <span>企业免费试用 1 个月</span>
          <i />
          <span>正式使用 ¥19 / 启用成员 / 月</span>
        </div>
      </section>

      <section className="premium-device" aria-label="Work Calendar AI 产品视觉预览">
        <div className="premium-device-frame">
          <div className="premium-device-top">
            <span />
            <span />
            <span />
            <strong>calendar.sevendata.cn</strong>
          </div>
          <div className="premium-product">
            <aside>
              <img src="/seven-ai-logo.png" alt="七数AI" />
              <b>AI日历</b>
              <b>填报</b>
              <b>AI汇报</b>
            </aside>
            <section className="premium-product-main">
              <div className="premium-product-head">
                <div>
                  <span>Team Intelligence</span>
                  <strong>团队工作状态</strong>
                </div>
                <Tag color="green">AI 已分析</Tag>
              </div>
              <div className="premium-product-metrics">
                <div>
                  <span>填报率</span>
                  <strong>92%</strong>
                </div>
                <div>
                  <span>风险</span>
                  <strong>1</strong>
                </div>
                <div>
                  <span>汇报</span>
                  <strong>4</strong>
                </div>
              </div>
              <div className="premium-product-calendar">
                {productTiles.map((item) => (
                  <div key={item.day} className={`is-${item.tone}`}>
                    <span>{item.day}</span>
                    <strong>{item.title}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="premium-ai-panel">
              <div>
                <Sparkles size={18} />
                AI 今日判断
              </div>
              <p>
                <span>研发项目存在外部依赖风险。</span>
                <span>建议今天完成资源确认。</span>
              </p>
            </section>
          </div>
        </div>
      </section>

      <section className="premium-strip" id="product">
        {highlights.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section className="premium-black">
        <div>
          <span>Work Intelligence</span>
          <h2>
            <span>不止收集日报。</span>
            <span>AI 看懂每日工作。</span>
          </h2>
        </div>
        <div className="premium-black-grid">
          <article>
            <CalendarDays size={24} />
            <h3>日历即状态</h3>
            <p>工作按日呈现。</p>
          </article>
          <article>
            <Sparkles size={24} />
            <h3>AI 即汇报</h3>
            <p>自动生成周期汇报。</p>
          </article>
          <article>
            <ShieldCheck size={24} />
            <h3>风险即提醒</h3>
            <p>风险提前提醒。</p>
          </article>
        </div>
      </section>

      <section className="premium-pricing" id="pricing">
        <div className="premium-section-head">
          <span>Pricing</span>
          <h2>
            <span>先完整试用。</span>
            <span>再按启用成员付费。</span>
          </h2>
        </div>
        <div className="premium-pricing-layout">
          <div className="premium-plans">
            <article>
              <h3>免费试用</h3>
              <strong>¥0</strong>
              <p>1 个月，不限人数。</p>
              <ul>
                <li>
                  <CheckCircle2 size={15} />
                  完整功能开放
                </li>
                <li>
                  <CheckCircle2 size={15} />
                  AI 日报 / 周报 / 月报
                </li>
                <li>
                  <CheckCircle2 size={15} />
                  AI 风险分析
                </li>
              </ul>
              <Button block onClick={scrollToSignup}>
                免费创建企业
              </Button>
            </article>
            <article className="is-pro">
              <h3>专业版</h3>
              <strong>¥19</strong>
              <p>启用成员 / 月。</p>
              <ul>
                <li>
                  <CheckCircle2 size={15} />
                  按启用成员计费
                </li>
                <li>
                  <CheckCircle2 size={15} />
                  可随时新增或停用成员
                </li>
                <li>
                  <CheckCircle2 size={15} />
                  适合持续运营团队
                </li>
              </ul>
              <Button type="primary" block onClick={scrollToSignup}>
                开始免费试用
              </Button>
            </article>
          </div>

          <div className="premium-signup" id="signup">
            <h3>免费创建企业</h3>
            <p>创建账号，进入工作台。</p>
            {token ? (
              <Alert
                className="mb-4"
                type="info"
                showIcon
                message="你已登录，可以直接进入工作台。"
                action={
                  <Button size="small" type="primary" onClick={() => router.push("/calendar")}>
                    进入工作台
                  </Button>
                }
              />
            ) : null}
            {register.error ? <Alert className="mb-4" type="error" showIcon message={(register.error as Error).message} /> : null}
            <Form
              form={form}
              className="premium-signup-form"
              layout="vertical"
              onFinish={(values) => register.mutate({ ...values, tenantCode: normalizeUnifiedSocialCreditCode(values.tenantCode) })}
            >
              <Form.Item name="companyName" label="企业名称" rules={[{ required: true, min: 2 }]}>
                <Input placeholder="例如：星河科技有限公司" />
              </Form.Item>
              <Form.Item
                name="tenantCode"
                label="统一社会信用代码"
                normalize={normalizeUnifiedSocialCreditCode}
                rules={[{ required: true, pattern: unifiedSocialCreditCodePattern, message: unifiedSocialCreditCodeMessage }]}
              >
                <Input placeholder="例如：91110105MA01A1B2X3" />
              </Form.Item>
              <div className="premium-form-grid">
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
                免费创建企业
              </Button>
            </Form>
          </div>
        </div>
      </section>

      <section className="premium-security" id="security">
        <div>
          <LockKeyhole size={22} />
          <h2>
            <span>企业数据按租户隔离。</span>
            <span>关键操作可追溯。</span>
          </h2>
        </div>
        <p>
          <span>北京七数智联科技有限公司。</span>
          <span>提供研发、部署和运维支持。</span>
        </p>
      </section>

      <footer className="premium-footer">
        <div>
          <strong>七数AI / Work Calendar AI</strong>
          <span>北京七数智联科技有限公司</span>
        </div>
        <nav aria-label="页脚链接">
          <a href="#security">隐私政策</a>
          <a href="#security">服务协议</a>
          <a href="mailto:contact@sevendata.cn">联系方式</a>
        </nav>
        <div>
          <span>calendar.sevendata.cn</span>
          <span>冀ICP备19023975号</span>
        </div>
      </footer>
    </main>
  );
}
