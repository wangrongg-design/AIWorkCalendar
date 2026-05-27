"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Form, Input, Tag, Typography, Upload, message } from "antd";
import type { RcFile, UploadFile } from "antd/es/upload/interface";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileText,
  ImagePlus,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { tenantLogoSpec, validateTenantLogoFile } from "@/lib/tenant-logo";
import { AuthUser } from "@/lib/types";
import { normalizeUnifiedSocialCreditCode, unifiedSocialCreditCodeMessage, unifiedSocialCreditCodePattern } from "@/lib/unified-social-credit-code";

type RegisterForm = {
  companyName: string;
  tenantCode: string;
  adminName: string;
  adminEmail: string;
  password: string;
  logoUrl?: string;
};

type RegisterResponse = {
  accessToken: string;
  user: AuthUser;
};

const navItems = [
  { label: "产品能力", href: "#capabilities" },
  { label: "使用流程", href: "#workflow" },
  { label: "价格", href: "#pricing" },
  { label: "数据安全", href: "#security" }
];

const heroSignals = [
  "AI 自动生成日报、周报、月报",
  "自动发现项目延期和团队风险",
  "日历看板实时呈现团队状态"
];

const outcomeCards = [
  {
    title: "不用再催日报",
    description: "成员按天填报，AI 自动整理重点，管理者直接看团队状态。",
    metric: "每日",
    icon: <CalendarDays size={22} />
  },
  {
    title: "不用手工写汇报",
    description: "日报、计划、风险和项目进展自动归纳为日报、周报、月报。",
    metric: "AI",
    icon: <ClipboardCheck size={22} />
  },
  {
    title: "风险提前看见",
    description: "延期、阻塞、缺失填报和重复问题会被 AI 识别并提醒。",
    metric: "风险",
    icon: <AlertTriangle size={22} />
  }
];

const corePanels = [
  {
    title: "自动生成管理汇报",
    description: "AI 把每天分散的填报内容整理成管理者能直接看的工作摘要、完成事项、后续计划和工时分布。",
    points: ["AI日报", "AI周报", "AI月报"],
    icon: <FileText size={22} />
  },
  {
    title: "自动理解团队风险",
    description: "不只统计填报数量，还能从文字里识别延期、依赖、阻塞和异常工时，减少管理盲区。",
    points: ["延期识别", "阻塞归因", "缺失提醒"],
    icon: <Sparkles size={22} />
  },
  {
    title: "自动沉淀项目上下文",
    description: "日报、计划、项目、成员和部门连接在一起，后续复盘、问答和汇报都有完整上下文。",
    points: ["项目管理", "日历看板", "企业知识"],
    icon: <Workflow size={22} />
  }
];

const capabilityCards = [
  {
    title: "AI日报",
    description: "自动提炼当天完成事项、风险问题和下一步计划。",
    icon: <FileText size={20} />
  },
  {
    title: "AI周报",
    description: "按团队、部门和项目汇总一周进展，减少手工整理。",
    icon: <ClipboardCheck size={20} />
  },
  {
    title: "AI月报",
    description: "沉淀月度成果、工时分布和项目推进情况。",
    icon: <BarChart3 size={20} />
  },
  {
    title: "AI风险分析",
    description: "从延期、缺失填报和重复阻塞中识别团队风险。",
    icon: <AlertTriangle size={20} />
  },
  {
    title: "日历看板",
    description: "用日历查看每日填报、团队状态和风险日期。",
    icon: <CalendarDays size={20} />
  },
  {
    title: "项目管理",
    description: "让日报、计划、项目和成员组织关系形成业务上下文。",
    icon: <Workflow size={20} />
  }
];

const workflowSteps = ["创建企业", "邀请成员", "每日填报", "AI生成汇报", "管理者查看团队状态"];

const pricingPlans = [
  {
    name: "免费试用",
    price: "¥0",
    description: "企业免费试用1个月，不限制人数，完整功能开放。",
    features: ["企业免费试用 1 个月", "试用期不限制成员人数", "开放 AI 日报、周报、月报", "开放 AI 风险分析和日历看板"],
    note: "适合企业上线前完整验证流程",
    cta: "免费创建企业"
  },
  {
    name: "专业版",
    price: "¥19",
    period: "/ 启用成员 / 月",
    badge: "正式使用",
    description: "按企业内启用成员数量计费，新增和停用成员都可按周期管理。",
    features: ["按启用成员计费", "可随时新增或停用成员", "管理员可查看订阅与订单", "适合持续运营的团队工作台"],
    cta: "开始免费试用",
    recommended: true
  }
];

const securityItems = [
  {
    title: "企业数据按租户隔离",
    description: "系统以企业租户为边界隔离组织、项目、填报、报告和审计数据。",
    icon: <Database size={20} />
  },
  {
    title: "管理员可导出数据",
    description: "企业管理员可导出全企业数据备份，用于留存、迁移或停止使用前交接。",
    icon: <Download size={20} />
  },
  {
    title: "关键操作保留审计",
    description: "登录、注册、订阅、导出、删除申请等关键动作会进入审计日志。",
    icon: <LockKeyhole size={20} />
  }
];

const calendarCells = [
  { day: "12", label: "已填报", state: "done" },
  { day: "13", label: "AI汇总", state: "ai" },
  { day: "14", label: "延期风险", state: "risk" },
  { day: "15", label: "计划", state: "plan" },
  { day: "16", label: "周报", state: "report" },
  { day: "17", label: "复盘", state: "done" }
];

export default function HomePage() {
  const router = useRouter();
  const [form] = Form.useForm<RegisterForm>();
  const token = useAuthStore((state) => state.token);
  const setSession = useAuthStore((state) => state.setSession);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoFileList, setLogoFileList] = useState<UploadFile[]>([]);

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

  const beforeLogoUpload = async (file: RcFile) => {
    try {
      const logo = await validateTenantLogoFile(file);
      form.setFieldsValue({ logoUrl: logo.dataUrl });
      setLogoPreview(logo.dataUrl);
      setLogoFileList([{ uid: file.uid, name: file.name, status: "done", size: file.size }]);
      message.success("企业 Logo 已添加");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "企业 Logo 不符合规格");
    }
    return false;
  };

  const scrollToSignup = () => {
    document.getElementById("signup")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="brand-site min-h-screen" id="top">
      <header className="brand-nav">
        <a className="brand-lockup" href="#top" aria-label="七数AI Work Calendar AI 官网首页">
          <img src="/seven-ai-logo.png" alt="七数AI" />
          <span>Work Calendar AI</span>
        </a>
        <nav className="brand-nav-links" aria-label="官网导航">
          {navItems.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="brand-nav-actions">
          <Button icon={<LogIn size={16} />} onClick={() => router.push(token ? "/calendar" : "/login")}>
            {token ? "进入系统" : "登录系统"}
          </Button>
          <Button type="primary" icon={<ArrowRight size={16} />} onClick={scrollToSignup}>
            免费试用
          </Button>
        </div>
      </header>

      <section className="brand-hero">
        <div className="brand-hero-copy">
          <div className="brand-eyebrow">
            <Sparkles size={16} />
            七数AI · 企业 AI 工作日历
          </div>
          <Typography.Title className="brand-hero-title">
            <span>让 AI 自动理解团队工作</span>
            <em>自动生成汇报、提前发现风险</em>
          </Typography.Title>
          <Typography.Paragraph className="brand-hero-lead">
            Work Calendar AI 把日报、计划、项目和团队状态沉淀到同一个日历里，让管理者不用追问，也能看懂每天发生了什么。
          </Typography.Paragraph>
          <div className="brand-hero-actions">
            <Button type="primary" size="large" icon={<ArrowRight size={18} />} onClick={scrollToSignup}>
              免费创建企业
            </Button>
            <Button size="large" icon={<LogIn size={18} />} onClick={() => router.push("/login")}>
              登录系统
            </Button>
          </div>
          <div className="brand-price-strip">
            <div>
              <span>企业免费试用</span>
              <strong>1个月，不限制人数</strong>
            </div>
            <div>
              <span>正式使用</span>
              <strong>¥19 / 启用成员 / 月</strong>
            </div>
            <div>
              <span>适合团队</span>
              <strong>项目型、研发型、交付型企业</strong>
            </div>
          </div>
          <div className="brand-signal-row">
            {heroSignals.map((item) => (
              <span key={item}>
                <CheckCircle2 size={16} />
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="brand-product-shell" aria-label="Work Calendar AI 产品看板预览">
          <div className="brand-product-window">
            <div className="brand-window-bar">
              <div>
                <i />
                <i />
                <i />
              </div>
              <span>calendar.sevendata.cn</span>
            </div>
            <div className="brand-product-ui">
              <aside className="brand-product-side">
                <img src="/seven-ai-logo.png" alt="七数AI" />
                <span className="is-active">AI日历</span>
                <span>填报</span>
                <span>AI汇报</span>
                <span>团队</span>
              </aside>
              <div className="brand-product-main">
                <div className="brand-product-head">
                  <div>
                    <strong>团队工作状态</strong>
                    <span>2026 / 05 / 第 4 周</span>
                  </div>
                  <Tag color="green">AI 已分析</Tag>
                </div>
                <div className="brand-metric-grid">
                  <div>
                    <span>填报率</span>
                    <strong>92%</strong>
                  </div>
                  <div>
                    <span>风险项目</span>
                    <strong>1</strong>
                  </div>
                  <div>
                    <span>已生成汇报</span>
                    <strong>4</strong>
                  </div>
                </div>
                <div className="brand-calendar-grid">
                  {calendarCells.map((item) => (
                    <div key={item.day} className={`is-${item.state}`}>
                      <span>{item.day}</span>
                      <strong>{item.label}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <section className="brand-product-ai">
                <div className="brand-ai-title">
                  <Sparkles size={17} />
                  AI 今日判断
                </div>
                <p>研发项目存在外部依赖风险，建议今天完成资源确认；交付团队填报率较上周提升 18%。</p>
                <div className="brand-ai-tags">
                  <span>生成周报</span>
                  <span>查看风险</span>
                  <span>导出备份</span>
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      <section className="brand-outcome-band" aria-label="核心价值">
        {outcomeCards.map((item) => (
          <article key={item.title} className="brand-outcome-card">
            <div className="brand-outcome-icon">{item.icon}</div>
            <div>
              <span>{item.metric}</span>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="brand-section brand-core-section" id="capabilities">
        <div className="brand-section-head">
          <span>产品核心</span>
          <Typography.Title level={2}>核心不是填表，是让 AI 看懂组织每天发生了什么</Typography.Title>
          <Typography.Paragraph>
            企业已经有很多工具记录事项，但管理者缺的是自动整理、自动归因、自动提醒。Work Calendar AI 从每日工作记录开始，把团队状态变成可追踪的数据。
          </Typography.Paragraph>
        </div>
        <div className="brand-core-grid">
          {corePanels.map((item) => (
            <article key={item.title} className="brand-core-panel">
              <div className="brand-card-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div>
                {item.points.map((point) => (
                  <span key={point}>{point}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="brand-section">
        <div className="brand-section-head">
          <span>功能矩阵</span>
          <Typography.Title level={2}>六个能力覆盖团队日常管理闭环</Typography.Title>
        </div>
        <div className="brand-capability-grid">
          {capabilityCards.map((item) => (
            <article key={item.title} className="brand-capability-card">
              <div className="brand-card-icon">{item.icon}</div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="brand-section brand-workflow-section" id="workflow">
        <div className="brand-section-head">
          <span>使用流程</span>
          <Typography.Title level={2}>五步上线企业 AI 工作日历</Typography.Title>
        </div>
        <div className="brand-flow">
          {workflowSteps.map((step, index) => (
            <div key={step} className="brand-flow-step">
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="brand-section brand-pricing-section" id="pricing">
        <div className="brand-section-head">
          <span>价格与试用</span>
          <Typography.Title level={2}>企业先完整试用，再按启用成员付费</Typography.Title>
          <Typography.Paragraph>免费试用 1 个月不限制人数；正式使用 ¥19 / 启用成员 / 月。</Typography.Paragraph>
        </div>
        <div className="brand-pricing-layout">
          <div className="brand-pricing-cards">
            {pricingPlans.map((plan) => (
              <article key={plan.name} className={`brand-pricing-card ${plan.recommended ? "is-recommended" : ""}`}>
                <div className="brand-pricing-head">
                  <h3>{plan.name}</h3>
                  {plan.badge ? <Tag color="blue">{plan.badge}</Tag> : null}
                </div>
                <div className="brand-price">
                  <strong>{plan.price}</strong>
                  {"period" in plan ? <span>{plan.period}</span> : null}
                </div>
                <p>{plan.description}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <CheckCircle2 size={15} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                {"note" in plan ? <div className="brand-plan-note">{plan.note}</div> : null}
                <Button type={plan.recommended ? "primary" : "default"} block onClick={scrollToSignup}>
                  {plan.cta}
                </Button>
              </article>
            ))}
          </div>

          <div className="brand-signup-panel" id="signup">
            <div className="brand-signup-head">
              <div className="brand-card-icon">
                <Building2 size={20} />
              </div>
              <div>
                <h3>免费创建企业</h3>
                <p>创建企业管理员账号，立即进入 AI 工作空间。</p>
              </div>
            </div>
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
              className="brand-signup-form"
              layout="vertical"
              onFinish={(values) => register.mutate({ ...values, tenantCode: normalizeUnifiedSocialCreditCode(values.tenantCode) })}
            >
              <Form.Item name="companyName" label="企业名称" rules={[{ required: true, min: 2 }]}>
                <Input placeholder="例如：星河科技有限公司" />
              </Form.Item>
              <Form.Item
                name="tenantCode"
                label="统一社会信用代码"
                extra="请填写营业执照上的 18 位统一社会信用代码，用于企业唯一识别。"
                normalize={normalizeUnifiedSocialCreditCode}
                rules={[{ required: true, pattern: unifiedSocialCreditCodePattern, message: unifiedSocialCreditCodeMessage }]}
              >
                <Input placeholder="例如：91110105MA01A1B2X3" />
              </Form.Item>
              <div className="brand-signup-form-grid">
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
              <Form.Item name="logoUrl" hidden>
                <Input />
              </Form.Item>
              <Form.Item label="企业 Logo" extra={`可选。${tenantLogoSpec.helpText} 登录后侧边栏将显示企业 Logo。`}>
                <Upload.Dragger
                  accept="image/png"
                  maxCount={1}
                  fileList={logoFileList}
                  beforeUpload={beforeLogoUpload}
                  onRemove={() => {
                    form.setFieldsValue({ logoUrl: undefined });
                    setLogoPreview(null);
                    setLogoFileList([]);
                    return true;
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    {logoPreview ? (
                      <img src={logoPreview} alt="企业 Logo 预览" className="mx-auto h-12 max-w-[170px] object-contain" />
                    ) : (
                      <ImagePlus size={28} />
                    )}
                  </p>
                  <p className="ant-upload-text">上传企业 Logo</p>
                  <p className="ant-upload-hint">PNG，建议 620 x 220px。</p>
                </Upload.Dragger>
              </Form.Item>
              <Button type="primary" htmlType="submit" block icon={<ArrowRight size={16} />} loading={register.isPending}>
                免费创建企业
              </Button>
            </Form>
          </div>
        </div>
      </section>

      <section className="brand-section brand-security-section" id="security">
        <div className="brand-section-head">
          <span>信任与合规</span>
          <Typography.Title level={2}>面向企业使用场景设计数据边界</Typography.Title>
          <Typography.Paragraph>
            产品由北京七数智联科技有限公司提供，围绕企业租户隔离、数据导出和审计追溯建设基础合规能力。
          </Typography.Paragraph>
        </div>
        <div className="brand-security-grid">
          <div className="brand-company-panel">
            <img src="/seven-ai-logo.png" alt="七数AI" />
            <h3>北京七数智联科技有限公司</h3>
            <p>Work Calendar AI 为企业提供 AI 工作填报、智能汇报、团队日历和项目风险分析能力。</p>
            <div>
              <span>
                <ShieldCheck size={15} />
                企业数据保密
              </span>
              <span>
                <Users size={15} />
                管理员可治理
              </span>
            </div>
          </div>
          <div className="brand-security-list">
            {securityItems.map((item) => (
              <article key={item.title} className="brand-security-card">
                <div className="brand-card-icon">{item.icon}</div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="brand-footer">
        <div>
          <strong>七数AI / Work Calendar AI</strong>
          <span>官网域名：https://calendar.sevendata.cn</span>
        </div>
        <nav aria-label="页脚链接">
          <a href="#security">隐私政策</a>
          <a href="#security">服务协议</a>
          <a href="mailto:contact@sevendata.cn">联系方式</a>
        </nav>
        <div className="brand-footer-meta">
          <span>公司名称：北京七数智联科技有限公司</span>
          <span>ICP备案号：冀ICP备19023975号</span>
        </div>
      </footer>
    </main>
  );
}
