import { ArrowRight, Bot, CalendarDays, CheckCircle2, Clock3, FileText, LockKeyhole, MessageSquareText, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

const painPoints = [
  "日报散在群聊和文档里，月底很难复盘",
  "管理者只能催填报，看不到风险和投入",
  "周报月报反复复制粘贴，内容还不稳定"
];

const loopItems = [
  {
    icon: MessageSquareText,
    title: "一句话填报",
    text: "员工用自然语言说明完成事项、计划和风险，系统自动整理为结构化日报。"
  },
  {
    icon: CalendarDays,
    title: "月历看团队",
    text: "管理者按天查看已填、未填、工时、风险和项目投入，团队状态一眼清楚。"
  },
  {
    icon: Bot,
    title: "AI 直接问答",
    text: "围绕本月重点、今天风险、未来计划提问，回答只基于权限内真实记录。"
  },
  {
    icon: FileText,
    title: "汇报自动成稿",
    text: "一键生成日报、周报和部门汇报，支持下载 Word 继续编辑。"
  }
];

const metrics = [
  { label: "试用席位", value: "3 人" },
  { label: "试用周期", value: "1 个月" },
  { label: "核心闭环", value: "填报+看板+汇报" }
];

const safeguards = [
  { icon: LockKeyhole, text: "企业数据按租户隔离" },
  { icon: ShieldCheck, text: "管理员可导出备份" },
  { icon: Clock3, text: "保留审计记录" }
];

export default function H5PromoPage() {
  return (
    <main className="h5-page">
      <section className="h5-hero">
        <div className="h5-hero-scene" aria-hidden="true">
          <div className="h5-scene-shell">
            <div className="h5-scene-topbar">
              <span />
              <span />
              <span />
            </div>
            <div className="h5-scene-grid">
              {Array.from({ length: 21 }).map((_, index) => (
                <div key={index} className={index === 16 ? "is-hot" : index === 18 ? "is-risk" : ""}>
                  <span>{index + 5}</span>
                  <b>{index === 16 ? "66%" : index === 18 ? "风险" : index % 4 === 0 ? "已填" : "未填"}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="h5-ai-panel">
            <div className="h5-ai-title">
              <Bot size={16} />
              AI 日历问答
            </div>
            <p>本月共 4 条日报计划，重点集中在商业化版本、AI 汇报和发布联调。</p>
          </div>
        </div>

        <header className="h5-nav">
          <a className="h5-brand" href="/">
            <img src="/seven-ai-logo.png" alt="七数AI" />
            <span>Work Calendar AI</span>
          </a>
          <a className="h5-nav-link" href="/login">
            登录
          </a>
        </header>

        <div className="h5-hero-copy">
          <p className="h5-eyebrow">企业 AI 工作填报与智能汇报</p>
          <h1>Work Calendar AI</h1>
          <p className="h5-hero-lead">把团队日报放进日历，让 AI 基于真实工作记录生成可用汇报。</p>
          <div className="h5-actions">
            <a className="h5-primary-action" href="/">
              免费试用
              <ArrowRight size={18} />
            </a>
            <a className="h5-secondary-action" href="/login">
              查看演示账号
            </a>
          </div>
          <div className="h5-proof">
            {metrics.map((item) => (
              <div key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="h5-section h5-pain-section">
        <div className="h5-section-heading">
          <span>团队日报的真实问题</span>
          <h2>不是没人填，是填了也很难管理</h2>
        </div>
        <div className="h5-pain-list">
          {painPoints.map((item) => (
            <div key={item}>
              <CheckCircle2 size={18} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="h5-section">
        <div className="h5-section-heading">
          <span>产品闭环</span>
          <h2>从员工填报到管理汇报，一条线跑通</h2>
        </div>
        <div className="h5-loop-grid">
          {loopItems.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="h5-loop-card">
                <Icon size={24} />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="h5-showcase">
        <div className="h5-phone">
          <div className="h5-phone-header">
            <span>2026-05</span>
            <strong>日历看板</strong>
          </div>
          <div className="h5-phone-summary">
            <div>
              <span>填报率</span>
              <strong>66.7%</strong>
            </div>
            <div>
              <span>风险</span>
              <strong>2</strong>
            </div>
          </div>
          <div className="h5-phone-calendar">
            {["一", "二", "三", "四", "五", "六", "日"].map((item) => (
              <span key={item}>{item}</span>
            ))}
            {Array.from({ length: 28 }).map((_, index) => (
              <b key={index} className={index === 24 ? "is-active" : index === 25 ? "is-plan" : ""}>
                {index + 1}
              </b>
            ))}
          </div>
        </div>
        <div className="h5-showcase-copy">
          <Sparkles size={28} />
          <h2>管理者不用等周会，随时看见团队状态</h2>
          <p>填报进度、缺失人员、风险提示、工时投入和未来计划都沉淀在一个月历视图里。需要判断重点时，直接问 AI。</p>
        </div>
      </section>

      <section className="h5-section">
        <div className="h5-section-heading">
          <span>企业可用</span>
          <h2>首版就覆盖试用、席位和数据边界</h2>
        </div>
        <div className="h5-safeguards">
          {safeguards.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.text}>
                <Icon size={22} />
                <span>{item.text}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="h5-final-cta">
        <UsersRound size={28} />
        <h2>先让一个团队试起来</h2>
        <p>用 3 个免费席位跑通日报、计划、月历看板和 AI 汇报，再决定如何推广到更多部门。</p>
        <a className="h5-primary-action" href="/">
          创建企业试用
          <ArrowRight size={18} />
        </a>
      </section>
    </main>
  );
}
