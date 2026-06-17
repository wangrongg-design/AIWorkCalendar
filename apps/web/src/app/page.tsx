"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Form, Input, message } from "antd";
import {
  AlertCircle,
  ArrowRight,
  BarChart2,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Database,
  FileText,
  Layers,
  Lock,
  LogIn,
  Mail,
  Shield,
  Sparkles,
  Users
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AuthUser } from "@/lib/types";
import {
  normalizeUnifiedSocialCreditCode,
  unifiedSocialCreditCodeMessage,
  unifiedSocialCreditCodePattern
} from "@/lib/unified-social-credit-code";

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
  { label: "产品能力", href: "capabilities" },
  { label: "使用流程", href: "workflow" },
  { label: "价格", href: "pricing" },
  { label: "数据安全", href: "security" }
];

const valueCards = [
  {
    icon: <FileText size={20} />,
    title: "日报自动结构化",
    lines: ["员工用自然语言填写工作内容。", "系统自动识别日期、工时、项目、成果和风险。"]
  },
  {
    icon: <AlertCircle size={20} />,
    title: "风险自动提示",
    lines: ["延期、阻塞、异常工时会自动提示。", "无人跟进的事项会进入日历和汇报。"]
  },
  {
    icon: <Sparkles size={20} />,
    title: "周期汇报自动生成",
    lines: ["基于真实工作记录生成日报、周报和月报。", "项目总结不再依赖手工整理。"]
  },
  {
    icon: <BarChart2 size={20} />,
    title: "管理者一眼看懂团队状态",
    lines: ["谁已填报，谁未填报。", "哪个项目有风险，哪些事项需要跟进。"]
  }
];

const capabilityCards = [
  { accent: "blue", title: "日报提炼", lines: ["员工填写当天工作。", "系统提取成果、工时、项目和风险。"] },
  { accent: "blue", title: "团队周报", lines: ["系统按周汇总团队工作重点。", "项目进展、风险变化和下周计划同步生成。"] },
  { accent: "blue", title: "月度汇总", lines: ["管理者快速查看团队月度产出。", "项目投入和关键问题集中呈现。"] },
  { accent: "red", title: "风险分析", lines: ["自动识别延期、阻塞和重复问题。", "异常投入和无人跟进事项会被提示。"] },
  { accent: "black", title: "日历看板", lines: ["按日查看填报率和缺填人员。", "风险数量和团队状态集中呈现。"] },
  { accent: "orange", title: "项目管理", lines: ["日报可关联项目。", "管理者按项目查看投入、进展和风险。"] }
];

const workflowSteps = [
  { title: "创建企业", lines: ["管理员注册账号。", "创建企业工作空间。"] },
  { title: "邀请成员", lines: ["添加部门、成员和角色。", "员工进入同一个工作空间。"] },
  { title: "每日填报", lines: ["员工每天填写工作日报。", "也可以填写未来计划。"] },
  { title: "生成周期汇报", lines: ["系统自动整理日报、周报和月报。", "风险和项目进展同步生成。"] },
  { title: "管理者查看团队状态", lines: ["管理者查看日历看板和周期汇报。", "及时发现问题并推进工作。"] }
];

const trialFeatures = ["创建企业空间", "邀请部门成员", "日报提炼", "周报归纳", "月报生成", "日历看板面板", "风险识别分析"];
const proFeatures = ["全部免费试用能力", "项目管理关联追踪", "团队状态图谱分析", "跨周期深度汇报生成", "企业历史数据导出", "多级管理员权限管理"];

const securityCards = [
  { icon: <Database size={18} />, title: "租户隔离", lines: ["不同企业的数据相互隔离。", "存储层和计算逻辑层独立处理。"] },
  { icon: <Lock size={18} />, title: "权限控制", lines: ["员工、部门经理、企业管理员。", "不同角色拥有不同可见范围。"] },
  { icon: <Shield size={18} />, title: "数据导出", lines: ["管理员可按业务需要导出数据。", "工作、汇报和项目记录都可沉淀。"] },
  { icon: <Layers size={18} />, title: "操作可追溯", lines: ["核心业务沉淀在企业空间中。", "填报痕迹支持后续追溯。"] }
];

const faqItems = [
  { question: "免费试用多久？", lines: ["企业可免费试用 1 个月。", "试用期内不限制人数。"] },
  { question: "正式版怎么收费？", lines: ["正式版为 ¥19 / 启用成员 / 月。", "只按启用成员计费。"] },
  { question: "员工需要复杂培训吗？", lines: ["不需要。", "员工只需要像写普通日报一样填写工作内容。", "系统会自动整理和分析。"] },
  { question: "系统会替员工写日报吗？", lines: ["系统不会凭空生成工作内容。", "只会基于员工填写的真实记录进行整理、分析和汇报。"] },
  { question: "管理者能看到哪些数据？", lines: ["管理者只能查看自己权限范围内的数据。", "包括团队、部门、项目和日报数据。"] },
  { question: "企业数据是否隔离？", lines: ["是。", "企业数据按租户隔离。", "不同企业的数据相互独立。"] }
];

export default function HomePage() {
  const router = useRouter();
  const [form] = Form.useForm<RegisterForm>();
  const token = useAuthStore((state) => state.token);
  const setSession = useAuthStore((state) => state.setSession);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  const register = useMutation({
    mutationFn: (values: RegisterForm) =>
      apiFetch<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          tenantCode: normalizeUnifiedSocialCreditCode(values.tenantCode)
        })
      }),
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
      message.success("企业已创建，已进入工作台。");
      router.replace("/calendar");
    }
  });

  const scrollTo = (id: string) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <main className="calendarseven-home">
      <nav className="calendarseven-nav">
        <button type="button" className="calendarseven-brand" onClick={() => scrollTo("top")} aria-label="七数AI Work Calendar AI 官网首页">
          <img src="/seven-ai-logo.png" alt="七数AI" />
          <span>Work Calendar AI</span>
        </button>

        <div className="calendarseven-nav-links" aria-label="官网导航">
          {navItems.map((item) => (
            <button key={item.href} type="button" onClick={() => scrollTo(item.href)}>
              {item.label}
            </button>
          ))}
        </div>

        <div className="calendarseven-nav-actions">
          <button type="button" onClick={() => router.push(token ? "/calendar" : "/login")}>
            登录
          </button>
          <Button type="primary" onClick={() => scrollTo("signup")}>
            免费试用
          </Button>
        </div>
      </nav>

      <section className="calendarseven-hero" id="top">
        <div className="calendarseven-hero-copy">
          <div className="calendarseven-chip">
            <Sparkles size={15} />
            <span>企业工作日历</span>
          </div>
          <h1>让 AI 自动理解团队工作</h1>
          <p className="calendarseven-lede">员工照常填报，管理者直接看到缺填、风险、项目进展和下一步动作。</p>
          <p className="calendarseven-price-line">
            <span>企业免费试用 1 个月。</span>
            <span>按启用成员计费，管理员可随时停用成员。</span>
          </p>
          <div className="calendarseven-hero-actions">
            <Button type="primary" size="large" icon={<ArrowRight size={18} />} onClick={() => scrollTo("signup")}>
              免费创建企业
            </Button>
            <Button size="large" icon={<LogIn size={18} />} onClick={() => router.push("/login")}>
              登录系统
            </Button>
          </div>
        </div>

        <div className="calendarseven-product-window" aria-label="Work Calendar AI 产品视觉预览">
          <div className="calendarseven-window-bar">
            <i />
            <i />
            <i />
            <span>www.calendarseven.com</span>
            <strong>Team Board</strong>
          </div>
          <div className="calendarseven-window-body">
            <div className="calendarseven-window-head">
              <div>
                <span>工作日历看板</span>
                <strong>今日团队状态</strong>
              </div>
              <em>已更新 09:42</em>
            </div>

            <div className="calendarseven-status-grid">
              <article className="is-risk">
                <div>
                  <span>风险预警</span>
                  <AlertCircle size={18} />
                </div>
                <strong>3 条待确认</strong>
                <p>2 条延期风险，1 条开发阻塞。</p>
              </article>
              <article className="is-blue">
                <div>
                  <span>成员填报</span>
                  <Users size={18} />
                </div>
                <strong>5 位未填报</strong>
                <p>总提交率 58%，7/12 已提交。</p>
              </article>
            </div>

            <div className="calendarseven-week-panel">
              <span>本周项目进展已自动汇总</span>
              <p>从日报中提取移动端重构进展，并匹配技术阻塞状态。</p>
            </div>

            <div className="calendarseven-attention">
              <span>管理者关注事项</span>
              <p>
                <i className="is-warning" />
                海外支付联调存在网络阻塞，需要今天确认运维日志。
              </p>
              <p>
                <i className="is-success" />
                4 位前端开发已完成主模块自测，可以进入下阶段。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="calendarseven-section calendarseven-value">
        <div className="calendarseven-section-head">
          <h2>团队每天在做什么，不再靠人工追问。</h2>
          <p>
            <span>员工正常填报。</span>
            <span>系统自动整理内容。</span>
            <span>管理者直接看到进展、风险和汇报结果。</span>
          </p>
        </div>

        <div className="calendarseven-value-grid">
          {valueCards.map((item) => (
            <article key={item.title}>
              <div>{item.icon}</div>
              <h3>{item.title}</h3>
              <p>
                {item.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="calendarseven-section" id="capabilities">
        <div className="calendarseven-section-head is-centered">
          <h2>从每日填报，到团队管理闭环。</h2>
          <p>Work Calendar AI 把分散的工作记录，变成可查看、可分析、可追踪的团队工作资产。</p>
        </div>

        <div className="calendarseven-capability-grid">
          {capabilityCards.map((item) => (
            <article key={item.title}>
              <h3>
                <i className={`is-${item.accent}`} />
                {item.title}
              </h3>
              <p>
                {item.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="calendarseven-section calendarseven-workflow" id="workflow">
        <div className="calendarseven-flow-visual">
          <CalendarDays size={26} />
          <strong>五步开始使用</strong>
          <span>创建企业后即可邀请团队试用。</span>
        </div>
        <div className="calendarseven-flow-list">
          {workflowSteps.map((item, index) => (
            <article key={item.title}>
              <span>STEP {String(index + 1).padStart(2, "0")}</span>
              <h3>{item.title}</h3>
              <p>
                {item.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="calendarseven-section" id="pricing">
        <div className="calendarseven-section-head is-centered">
          <h2>先完整试用，再按启用成员付费。</h2>
          <p>免费试用、按启用成员计费，企业管理员可随时停用成员并导出数据。</p>
        </div>

        <div className="calendarseven-pricing-layout">
          <div className="calendarseven-procurement">
            <div className="calendarseven-procurement-head">
              <span>企业采购说明</span>
              <strong>免费试用后，按启用成员数量计费。</strong>
              <p>试用期内不限制人数。正式使用时，停用成员不计入当月估算费用，管理员可导出企业数据。</p>
            </div>
            <div className="calendarseven-procurement-grid">
              <article>
                <span>试用</span>
                <strong>1 个月免费</strong>
                <p>创建企业空间后立即开始，不需要先绑定支付。</p>
              </article>
              <article>
                <span>计费</span>
                <strong>¥19 / 启用成员 / 月</strong>
                <p>只计算企业内启用成员，管理员可随时停用离职或暂停成员。</p>
              </article>
              <article>
                <span>数据</span>
                <strong>隔离与导出</strong>
                <p>企业数据按租户隔离，管理员可在后台发起完整数据导出。</p>
              </article>
            </div>
            <div className="calendarseven-procurement-lists">
              <div>
                <h3>试用包含</h3>
                <ul>
                  {trialFeatures.map((feature) => (
                    <li key={feature}>
                      <Check size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>正式使用增加</h3>
                <ul>
                  {proFeatures.map((feature) => (
                    <li key={feature}>
                      <Check size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button type="button" onClick={() => scrollTo("signup")}>
              免费创建企业
            </button>
          </div>

          <div className="calendarseven-signup" id="signup">
            <h3>免费创建企业</h3>
            <p>创建企业工作空间，开始 1 个月免费试用。</p>
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
            <Form form={form} layout="vertical" onFinish={(values) => register.mutate(values)}>
              <Form.Item name="companyName" label="企业名称" rules={[{ required: true, min: 2 }]}>
                <Input prefix={<Building2 size={16} />} placeholder="请输入企业名称" />
              </Form.Item>
              <Form.Item
                name="tenantCode"
                label="企业代码"
                normalize={normalizeUnifiedSocialCreditCode}
                rules={[{ required: true, pattern: unifiedSocialCreditCodePattern, message: unifiedSocialCreditCodeMessage }]}
                extra="请填写营业执照上的 18 位统一社会信用代码。"
              >
                <Input prefix={<Shield size={16} />} placeholder="例如：91110105MA01A1B2X3" />
              </Form.Item>
              <Form.Item name="adminName" label="联系人姓名" rules={[{ required: true, min: 2 }]}>
                <Input prefix={<Users size={16} />} placeholder="请输入联系人姓名" />
              </Form.Item>
              <Form.Item name="adminEmail" label="联系人邮箱" rules={[{ required: true, type: "email" }]}>
                <Input prefix={<Mail size={16} />} placeholder="admin@company.com" />
              </Form.Item>
              <Form.Item name="password" label="设置密码" rules={[{ required: true, min: 6 }]}>
                <Input.Password prefix={<Lock size={16} />} placeholder="至少 6 位" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block loading={register.isPending}>
                创建企业并开始试用
              </Button>
            </Form>
            <div className="calendarseven-billing-note">
              <span>启用成员是指企业内正式使用系统的成员。</span>
              <span>未启用成员不计入正式付费。</span>
              <span>企业可先试用，再决定是否正式启用。</span>
            </div>
          </div>
        </div>
      </section>

      <section className="calendarseven-section calendarseven-security" id="security">
        <div className="calendarseven-section-head is-centered">
          <h2>企业数据按租户隔离。</h2>
          <p>每个企业拥有独立工作空间，成员只查看自己权限范围内的数据。</p>
        </div>

        <div className="calendarseven-security-grid">
          {securityCards.map((item) => (
            <article key={item.title}>
              <div>{item.icon}</div>
              <h3>{item.title}</h3>
              <p>
                {item.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </p>
            </article>
          ))}
        </div>

        <div className="calendarseven-faq">
          <div className="calendarseven-section-head is-centered">
            <h2>常见问题解答</h2>
            <p>快速了解试用、计费、权限和数据安全。</p>
          </div>
          <div className="calendarseven-faq-list">
            {faqItems.map((item, index) => {
              const isOpen = activeFaq === index;
              return (
                <article key={item.question} className={isOpen ? "is-open" : ""}>
                  <button type="button" onClick={() => setActiveFaq(isOpen ? null : index)} aria-expanded={isOpen}>
                    <span>{item.question}</span>
                    <ChevronDown size={18} />
                  </button>
                  {isOpen ? (
                    <p>
                      {item.lines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <div className="calendarseven-final-cta">
          <h2>让团队从今天开始自动沉淀工作状态。</h2>
          <p>
            <span>免费创建企业，邀请成员后即可开始试用。</span>
              <span>免费试用 1 个月，正式使用按启用成员计费。</span>
          </p>
          <div>
            <Button type="primary" size="large" icon={<ArrowRight size={18} />} onClick={() => scrollTo("signup")}>
              免费创建企业
            </Button>
            <Button size="large" icon={<LogIn size={18} />} onClick={() => router.push("/login")}>
              登录系统
            </Button>
          </div>
        </div>
      </section>

      <footer className="calendarseven-footer">
        <div>
          <img src="/seven-ai-logo.png" alt="七数AI" />
          <strong>Work Calendar AI</strong>
          <p>面向企业团队的工作日历系统。</p>
          <span>冀ICP备19023975号</span>
        </div>
        <nav aria-label="页脚链接">
          <button type="button" onClick={() => scrollTo("security")}>
            隐私政策
          </button>
          <button type="button" onClick={() => scrollTo("security")}>
            服务协议
          </button>
          <a href="mailto:support@calendarseven.com">联系方式</a>
        </nav>
        <div>
          <span>北京七数智联科技有限公司</span>
          <span>support@calendarseven.com</span>
          <span>© 2026 北京七数智联科技有限公司。保留所有权利。</span>
        </div>
      </footer>
    </main>
  );
}
