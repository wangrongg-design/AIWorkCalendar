import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardList, FileText, FolderKanban, ShieldCheck, UsersRound } from "lucide-react";

export const metadata: Metadata = {
  title: "使用指南",
  description: "Work Calendar AI 使用指南，按企业管理员、部门经理和员工角色说明首次登录、日常填报、工作日历、项目中心和周期汇报的使用方法。"
};

const roleGuides = [
  {
    id: "admin",
    icon: <ShieldCheck size={22} />,
    role: "企业管理员",
    summary: "负责把企业工作空间配置到可用状态，并持续管理成员、项目、权限和数据。",
    firstSteps: [
      "首次登录后进入首次使用指引，先确认企业名称、统一社会信用代码和管理员信息。",
      "建立部门结构，添加核心成员，并为成员设置员工、部门经理或企业管理员角色。",
      "确认哪些成员需要提交日报，先用推荐填报规则跑通团队流程。",
      "创建第一个项目，让后续工作记录可以沉淀到项目进展、风险和周期汇报中。"
    ],
    dailyUse: [
      "在工作日历查看全公司或指定部门的填报率、缺填成员、风险和阻塞。",
      "在项目中心查看项目投入、进展、风险和来源记录。",
      "在周期汇报选择团队日报、团队周报等类型，确认数据覆盖后生成可复用内容。",
      "在团队页维护成员启用状态、角色、部门、订阅、数据导出和企业微信集成。"
    ],
    checks: [
      "如果工作日历没有成员数据，先检查团队页中成员是否启用并开启“需要填报”。",
      "如果周期汇报无法生成，先检查所选范围内是否有足够已提交工作记录。",
      "如果成员看不到数据，检查角色和部门归属是否正确。"
    ]
  },
  {
    id: "manager",
    icon: <UsersRound size={22} />,
    role: "部门经理",
    summary: "负责查看本部门填报状态、风险和项目进展，并在会议前生成部门汇报。",
    firstSteps: [
      "首次登录后确认自己的部门、角色和可查看范围。",
      "提交一条真实工作记录，体验自然语言生成草稿、确认项目和提交记录的流程。",
      "打开工作日历，查看本部门今天谁已填、谁未填、哪里有风险或阻塞。",
      "进入周期汇报页，了解部门日报和部门周报的数据准备度。"
    ],
    dailyUse: [
      "每天先看工作日历的今日待处理，优先确认缺填、风险和阻塞。",
      "进入日期详情查看成员记录，按项目核对工作内容和工时投入。",
      "在项目中心追问项目进展、风险原因和负责人待办。",
      "周会前生成部门周报，复制风险清单和下一步动作。"
    ],
    checks: [
      "如果看不到某个成员，联系企业管理员检查成员是否在你的部门范围内。",
      "如果风险判断不准确，先补充项目归属、工时和更具体的工作内容。",
      "如果汇报内容偏少，扩大日期范围或提醒成员补齐记录。"
    ]
  },
  {
    id: "employee",
    icon: <ClipboardList size={22} />,
    role: "员工",
    summary: "负责提交自己的日报和计划，让工作内容、项目进展、风险和附件进入团队视图。",
    firstSteps: [
      "首次登录后确认姓名、部门、账号和是否需要提交日报。",
      "用一句自然语言描述今天做了什么、花了多久、是否有风险，系统会先生成草稿。",
      "确认日期、类型、项目、工时和内容后再提交，系统不会自动替你提交。",
      "打开填报记录，查看草稿、已提交记录、附件和 AI 结构化结果。"
    ],
    dailyUse: [
      "当天工作写日报，未来安排写计划，两类记录都会进入工作日历。",
      "一段话里可以包含多件事，系统会拆成多条候选记录，你逐条确认。",
      "有聊天截图、文档或现场照片时，可以上传附件并指定归属记录。",
      "提交后仍可在填报记录中查看详情，草稿可以继续编辑。"
    ],
    checks: [
      "如果项目没有自动匹配，手动选择项目或确认未关联项目。",
      "如果工时不准确，可以直接修改工时，也可以填写开始和结束时间自动计算。",
      "如果发现内容写错，先到填报记录中查看是否还能编辑或联系管理员处理。"
    ]
  }
];

const systemAreas = [
  { icon: <CalendarDays size={18} />, title: "工作日历", text: "看每天的填报率、缺填成员、风险/阻塞和团队状态。" },
  { icon: <ClipboardList size={18} />, title: "填报记录", text: "提交日报和计划，管理草稿、附件和已提交记录。" },
  { icon: <FolderKanban size={18} />, title: "项目中心", text: "按项目查看工作记录、投入、进展、风险和下一步动作。" },
  { icon: <FileText size={18} />, title: "周期汇报", text: "基于真实工作记录生成日报、周报和部门汇报。" }
];

export default function GuidePage() {
  return (
    <main className="calendarseven-home calendarseven-guide-page">
      <nav className="calendarseven-nav">
        <Link className="calendarseven-brand" href="/" aria-label="七数AI Work Calendar AI 官网首页">
          <img src="/seven-ai-logo.png" alt="七数AI" />
          <span>Work Calendar AI</span>
        </Link>

        <div className="calendarseven-nav-links" aria-label="官网导航">
          <Link href="/#capabilities">产品能力</Link>
          <Link href="/#workflow">使用流程</Link>
          <Link href="/guide">使用指南</Link>
          <Link href="/#pricing">价格</Link>
          <Link href="/#security">数据安全</Link>
        </div>

        <div className="calendarseven-nav-actions">
          <Link href="/login">登录系统</Link>
          <Link className="calendarseven-nav-primary" href="/#signup">免费试用</Link>
        </div>
      </nav>

      <section className="calendarseven-guide-hero">
        <div>
          <div className="calendarseven-chip">
            <BookOpen size={15} />
            <span>使用指南</span>
          </div>
          <h1>按角色开始使用 Work Calendar AI</h1>
          <p>系统首次登录会提供指引操作。完成后，可以回到这里按角色查看更完整的日常使用步骤。</p>
        </div>
        <div className="calendarseven-guide-map" aria-label="系统模块">
          {systemAreas.map((item) => (
            <article key={item.title}>
              <span>{item.icon}</span>
              <strong>{item.title}</strong>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="calendarseven-guide-index" aria-label="角色目录">
        {roleGuides.map((guide) => (
          <a key={guide.id} href={`#${guide.id}`}>
            <span>{guide.icon}</span>
            <strong>{guide.role}</strong>
            <em>查看步骤</em>
          </a>
        ))}
      </section>

      {roleGuides.map((guide) => (
        <section className="calendarseven-guide-section" id={guide.id} key={guide.id}>
          <div className="calendarseven-guide-role-head">
            <span>{guide.icon}</span>
            <div>
              <h2>{guide.role}</h2>
              <p>{guide.summary}</p>
            </div>
          </div>

          <div className="calendarseven-guide-columns">
            <article>
              <h3>第一次登录先做什么</h3>
              <ol>
                {guide.firstSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
            <article>
              <h3>日常怎么用</h3>
              <ol>
                {guide.dailyUse.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
            <article>
              <h3>常见检查点</h3>
              <ul>
                {guide.checks.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>
      ))}

      <section className="calendarseven-guide-cta">
        <div>
          <CheckCircle2 size={22} />
          <h2>首次使用指引完成后，就回到工作日历。</h2>
          <p>日常工作从工作日历开始：看今天状态、补齐记录、确认风险，再进入项目中心和周期汇报。</p>
        </div>
        <Link href="/login">
          登录系统
          <ArrowRight size={16} />
        </Link>
      </section>

      <footer className="calendarseven-footer">
        <div>
          <img src="/seven-ai-logo.png" alt="七数AI" />
          <strong>Work Calendar AI</strong>
          <p>面向企业团队的工作日历系统。</p>
          <span>冀ICP备19023975号</span>
        </div>
        <nav aria-label="页脚链接">
          <Link href="/#security">隐私政策</Link>
          <Link href="/#security">服务协议</Link>
          <Link href="/guide">使用指南</Link>
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
