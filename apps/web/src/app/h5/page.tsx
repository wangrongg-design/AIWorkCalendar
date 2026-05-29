import { ArrowRight, Bot, CalendarDays, CheckCircle2, FileText, LockKeyhole, ShieldCheck, Smartphone, Sparkles, UsersRound } from "lucide-react";

const sceneDays = Array.from({ length: 28 }, (_, index) => index + 1);

export default function H5PromoPage() {
  return (
    <main className="h5-page">
      <section className="h5-hero">
        <nav className="h5-nav">
          <a className="h5-brand" href="/">
            <img src="/seven-ai-logo.png" alt="七数AI" />
            <span>Work Calendar AI</span>
          </a>
          <a className="h5-nav-link" href="/login">
            已有账号登录
          </a>
        </nav>

        <div className="h5-hero-scene" aria-hidden="true">
          <div className="h5-scene-shell">
            <div className="h5-scene-topbar">
              <span />
              <span />
              <span />
            </div>
            <div className="h5-scene-grid">
              {sceneDays.map((day) => (
                <div key={day} className={day === 8 || day === 18 ? "is-risk" : day === 5 || day === 12 || day === 21 ? "is-hot" : undefined}>
                  <span>{day}</span>
                  <b>{day % 6 === 0 ? "风险" : day % 4 === 0 ? "已填" : "计划"}</b>
                </div>
              ))}
            </div>
          </div>
          <div className="h5-ai-panel">
            <div className="h5-ai-title">
              <Bot size={16} />
              AI 今日摘要
            </div>
            <p>团队 12 条日报已汇总，2 个项目存在交付风险，建议优先跟进未填报成员和阻塞事项。</p>
          </div>
        </div>

        <div className="h5-hero-copy">
          <p className="h5-eyebrow">企业 AI 工作日历</p>
          <h1>让团队工作自动成文</h1>
          <p className="h5-hero-lead">日报、计划、项目进展、团队风险和周期汇报自动沉淀，管理者每天打开日历就能看到真实工作状态。</p>
          <div className="h5-actions">
            <a className="h5-primary-action" href="/#signup">
              免费试用
              <ArrowRight size={16} />
            </a>
            <a className="h5-secondary-action" href="/login">
              登录工作台
            </a>
          </div>
          <div className="h5-proof">
            <div>
              <strong>1个月</strong>
              <span>企业免费试用</span>
            </div>
            <div>
              <strong>¥19</strong>
              <span>启用成员 / 月</span>
            </div>
            <div>
              <strong>AI</strong>
              <span>自动汇总风险</span>
            </div>
          </div>
        </div>
      </section>

      <section className="h5-section h5-pain-section">
        <div className="h5-section-heading">
          <span>解决管理断点</span>
          <h2>日报不是为了填表，而是为了让事实被看见。</h2>
        </div>
        <div className="h5-pain-list">
          <div>
            <CalendarDays size={20} />
            每天谁填了、谁没填、哪里有风险，一张日历直接看清。
          </div>
          <div>
            <Sparkles size={20} />
            AI 自动提取成果、风险、阻塞和下一步建议。
          </div>
          <div>
            <FileText size={20} />
            周报、月报、部门汇报可直接生成并下载。
          </div>
        </div>
      </section>

      <section className="h5-section">
        <div className="h5-section-heading">
          <span>工作闭环</span>
          <h2>从填报到复盘，减少人工整理。</h2>
        </div>
        <div className="h5-loop-grid">
          <div className="h5-loop-card">
            <Smartphone size={22} />
            <h3>员工填报</h3>
            <p>支持日报、计划、工时、项目和附件，快速完成每日记录。</p>
          </div>
          <div className="h5-loop-card">
            <Bot size={22} />
            <h3>AI 分析</h3>
            <p>自动识别重点成果、风险信号和异常投入。</p>
          </div>
          <div className="h5-loop-card">
            <UsersRound size={22} />
            <h3>团队看板</h3>
            <p>按个人、部门、全公司权限查看团队状态。</p>
          </div>
          <div className="h5-loop-card">
            <FileText size={22} />
            <h3>汇报下载</h3>
            <p>一键生成周期复盘和 Word 汇报，方便留档。</p>
          </div>
        </div>
      </section>

      <section className="h5-showcase">
        <div className="h5-phone">
          <div className="h5-phone-header">
            <span>今日团队</span>
            <strong>AI日历</strong>
          </div>
          <div className="h5-phone-summary">
            <div>
              <span>填报率</span>
              <strong>86%</strong>
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
            {sceneDays.slice(0, 21).map((day) => (
              <b key={day} className={day === 12 ? "is-active" : day === 16 ? "is-plan" : undefined}>
                {day}
              </b>
            ))}
          </div>
        </div>
        <div className="h5-showcase-copy">
          <ShieldCheck size={32} />
          <h2>默认按企业隔离，AI 分析前做最小化处理。</h2>
          <p>企业数据按租户隔离存储，系统只向 AI 发送完成任务所需的最小内容。企业版支持私有化部署、本地模型和专属数据库。</p>
        </div>
      </section>

      <section className="h5-section">
        <div className="h5-section-heading">
          <span>安全与权益</span>
          <h2>企业管理需要可追溯，也需要可退出。</h2>
        </div>
        <div className="h5-safeguards">
          <div>
            <LockKeyhole size={20} />
            权限隔离：员工、部门经理、企业管理员看到不同范围。
          </div>
          <div>
            <CheckCircle2 size={20} />
            数据治理：支持导出备份和删除申请留痕。
          </div>
          <div>
            <Bot size={20} />
            问题反馈：用户权益问题可提交并由管理员处理。
          </div>
        </div>
      </section>

      <section className="h5-final-cta">
        <Sparkles size={34} />
        <h2>把团队工作沉淀成企业资产。</h2>
        <p>现在创建企业，免费试用 1 个月。登录页仅用于已有账号进入工作台。</p>
        <a className="h5-primary-action" href="/#signup">
          免费创建企业
          <ArrowRight size={16} />
        </a>
      </section>
    </main>
  );
}
