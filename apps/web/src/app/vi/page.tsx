import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "VI 指导手册",
  description: "AIWorkCalendar 视觉识别、字体、颜色和组件规范。"
};

const neutralColors = [
  { name: "Black", token: "black", hex: "#1A1A1A", usage: "标题、核心文字" },
  { name: "Gray 7", token: "gray-7", hex: "#2E2E2E", usage: "强正文、重要说明" },
  { name: "Gray 6", token: "gray-6", hex: "#424242", usage: "正文" },
  { name: "Gray 5", token: "gray-5", hex: "#737373", usage: "次级文字" },
  { name: "Gray 4", token: "gray-4", hex: "#A3A3A3", usage: "辅助文字、占位符" },
  { name: "Gray 3", token: "gray-3", hex: "#CCCCCC", usage: "禁用、弱分割" },
  { name: "Gray 2", token: "gray-2", hex: "#E6E6E6", usage: "边框、分割线" },
  { name: "Gray 1", token: "gray-1", hex: "#F6F6F6", usage: "页面背景" },
  { name: "White", token: "white", hex: "#FFFFFF", usage: "卡片、表单、弹窗" }
];

const brandColors = [
  { group: "Primary Blue", name: "Pressed", token: "primary-pressed", hex: "#0847A6", usage: "按下态" },
  { group: "Primary Blue", name: "Primary", token: "primary", hex: "#0B57D0", usage: "主按钮、当前导航、当前日期" },
  { group: "Primary Blue", name: "Hover", token: "primary-hover", hex: "#1A73E8", usage: "悬停、活跃态" },
  { group: "Primary Blue", name: "Soft", token: "primary-container", hex: "#D3E3FD", usage: "选中浅底" },
  { group: "Primary Blue", name: "Background", token: "primary-bg", hex: "#EEF5FF", usage: "极浅背景" },
  { group: "AI Teal", name: "Deep", token: "ai-deep", hex: "#0B5F59", usage: "AI 强调文字" },
  { group: "AI Teal", name: "AI", token: "secondary", hex: "#0F766E", usage: "AI 洞察、安全、智能建议" },
  { group: "AI Teal", name: "Hover", token: "secondary-hover", hex: "#14A39A", usage: "AI 活跃态" },
  { group: "AI Teal", name: "Soft", token: "secondary-container", hex: "#CCFBF1", usage: "AI 浅底" },
  { group: "AI Teal", name: "Background", token: "secondary-bg", hex: "#ECFDF9", usage: "AI 极浅背景" }
];

const semanticColors = [
  { name: "Success", hex: "#16A34A", bg: "#F0FDF4", usage: "已提交、已完成、正常、通过" },
  { name: "Warning", hex: "#D97706", bg: "#FFFBEB", usage: "未填报、临近截止、待处理、部分完成" },
  { name: "Danger", hex: "#EE3B2B", bg: "#FEF2F2", usage: "风险、阻塞、失败、错误、删除" }
];

const typographyRows = [
  { platform: "iOS", role: "Large Title", size: "34 / 41", weight: "700", usage: "首页主标题" },
  { platform: "iOS", role: "Title 1", size: "28 / 34", weight: "700", usage: "页面标题" },
  { platform: "iOS", role: "Title 2", size: "22 / 28", weight: "600", usage: "模块标题" },
  { platform: "iOS", role: "Body", size: "16 / 24", weight: "400", usage: "正文" },
  { platform: "iOS", role: "Metric", size: "32 / 38", weight: "700", usage: "关键数据" },
  { platform: "Web", role: "H1", size: "32 / 40", weight: "700", usage: "后台一级标题" },
  { platform: "Web", role: "H2", size: "24 / 32", weight: "600", usage: "页面模块标题" },
  { platform: "Web", role: "Body", size: "14 / 22", weight: "400", usage: "正文与表格" },
  { platform: "Web", role: "Caption", size: "12 / 18", weight: "400", usage: "标签、表头、说明" },
  { platform: "Web", role: "Metric", size: "32 / 40", weight: "700", usage: "数据指标" }
];

const statusTags = [
  { label: "已提交", text: "#16A34A", bg: "#F0FDF4" },
  { label: "草稿", text: "#737373", bg: "#F6F6F6" },
  { label: "未填报", text: "#D97706", bg: "#FFFBEB" },
  { label: "风险", text: "#EE3B2B", bg: "#FEF2F2" },
  { label: "AI 分析中", text: "#0F766E", bg: "#ECFDF9" },
  { label: "当前选中", text: "#0B57D0", bg: "#EEF5FF" }
];

const calendarStates = [
  { label: "今日", color: "#0B57D0", description: "蓝色浅底 + 蓝色描边" },
  { label: "已完成", color: "#16A34A", description: "绿色点或状态条" },
  { label: "部分填报", color: "#0B57D0", description: "蓝色进度条" },
  { label: "未填报", color: "#D97706", description: "橙色点或角标" },
  { label: "风险", color: "#EE3B2B", description: "红色角标" },
  { label: "未来计划", color: "#0F766E", description: "青绿色点" }
];

const cssTokens = `:root {
  --color-black: #1A1A1A;
  --color-gray-7: #2E2E2E;
  --color-gray-6: #424242;
  --color-gray-5: #737373;
  --color-gray-4: #A3A3A3;
  --color-gray-3: #CCCCCC;
  --color-gray-2: #E6E6E6;
  --color-gray-1: #F6F6F6;
  --color-white: #FFFFFF;

  --color-primary: #0B57D0;
  --color-primary-hover: #1A73E8;
  --color-primary-pressed: #0847A6;
  --color-primary-soft: #D3E3FD;
  --color-primary-bg: #EEF5FF;

  --color-ai: #0F766E;
  --color-ai-hover: #14A39A;
  --color-ai-soft: #CCFBF1;
  --color-ai-bg: #ECFDF9;

  --color-success: #16A34A;
  --color-warning: #D97706;
  --color-danger: #EE3B2B;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
}`;

function ColorCard({ color }: { color: { name: string; token?: string; hex: string; usage: string } }) {
  const isDark = ["#1A1A1A", "#2E2E2E", "#424242", "#0B57D0", "#0847A6", "#0B5F59", "#0F766E", "#EE3B2B"].includes(color.hex);

  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-white">
      <div className="flex h-28 flex-col justify-end p-4" style={{ background: color.hex, color: isDark ? "#FFFFFF" : "#1A1A1A" }}>
        <div className="text-sm font-semibold">{color.name}</div>
        <div className="mt-1 text-xs opacity-80">{color.hex}</div>
      </div>
      <div className="p-4">
        {color.token ? <div className="text-xs font-semibold text-primary">--color-{color.token}</div> : null}
        <div className="mt-2 text-sm leading-6 text-muted">{color.usage}</div>
      </div>
    </div>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-line bg-white p-6 shadow-[0_16px_42px_rgba(26,26,26,0.04)]">
      <div className="text-xs font-bold uppercase tracking-[0.16em] text-secondary">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-bold leading-8 text-black">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function VisualIdentityPage() {
  return (
    <main className="min-h-screen bg-gray-1 px-6 py-8 text-text">
      <div className="mx-auto max-w-[1280px]">
        <header className="rounded-[28px] bg-black p-8 text-white">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-4">
                <img src="/seven-ai-logo.png" alt="七数AI" className="h-8 w-24 object-contain invert" />
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white/72">VI Manual v1.0</span>
              </div>
              <h1 className="mt-10 max-w-3xl text-5xl font-bold leading-[1.08] tracking-normal">
                AIWorkCalendar 视觉识别与开发规范
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/72">
                黑白灰建立高级和秩序，蓝色建立信任和操作，青绿色建立 AI 智能感，红橙绿建立清晰业务语义。
              </p>
            </div>
            <div className="grid min-w-[280px] gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4">
              {["企业级", "高频使用", "数据可信", "风险可见", "AI 辅助决策"].map((item) => (
                <div key={item} className="flex items-center justify-between border-b border-white/10 pb-2 last:border-0 last:pb-0">
                  <span className="text-sm text-white/68">{item}</span>
                  <span className="h-2 w-2 rounded-full bg-secondary-container" />
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="mt-6 grid gap-6">
          <Section eyebrow="01 Colors" title="中性色基础系统">
            <p className="mb-5 max-w-3xl text-sm leading-7 text-muted">
              中性色承担系统的秩序、可读性和高级感。页面背景使用 Gray 1，卡片和弹窗使用 White，正文优先使用 Gray 6。
            </p>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              {neutralColors.map((color) => (
                <ColorCard key={color.name} color={color} />
              ))}
            </div>
          </Section>

          <Section eyebrow="02 Brand Colors" title="主操作蓝与 AI 青绿">
            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-[18px] bg-primary-bg p-5">
                <div className="text-sm font-bold text-primary">Primary Blue</div>
                <p className="mt-2 text-sm leading-7 text-text">用于主按钮、当前导航、当前日期、重要链接和核心操作入口。</p>
              </div>
              <div className="rounded-[18px] bg-secondary-bg p-5">
                <div className="text-sm font-bold text-secondary">AI Teal</div>
                <p className="mt-2 text-sm leading-7 text-text">用于 AI 洞察、智能建议、数据安全和自动分析状态，不与主操作竞争。</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {brandColors.map((color) => (
                <ColorCard key={`${color.group}-${color.name}`} color={color} />
              ))}
            </div>
          </Section>

          <Section eyebrow="03 Semantic Colors" title="业务语义色">
            <div className="grid gap-4 md:grid-cols-3">
              {semanticColors.map((color) => (
                <div key={color.name} className="rounded-[18px] border border-line bg-white p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-10 w-10 rounded-full" style={{ background: color.hex }} />
                    <div>
                      <div className="text-base font-bold text-black">{color.name}</div>
                      <div className="text-xs text-muted">{color.hex}</div>
                    </div>
                  </div>
                  <div className="mt-5 rounded-[14px] p-4 text-sm leading-7" style={{ background: color.bg, color: color.hex }}>
                    {color.usage}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-sm leading-7 text-muted">
              Red #EE3B2B 只用于风险、错误和破坏性操作，不作为品牌主色、登录按钮或主 CTA。
            </p>
          </Section>

          <Section eyebrow="04 Typography" title="字体与字号规范">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[18px] bg-gray-1 p-5">
                <h3 className="text-xl font-bold text-black">字体策略</h3>
                <div className="mt-4 grid gap-4 text-sm leading-7 text-text">
                  <p>
                    <strong>iOS：</strong> 使用 Apple 系统字体，不内置字体文件。中文由系统自动使用 PingFang SC，英文和数字由系统自动使用 SF 系列。
                  </p>
                  <p>
                    <strong>Web：</strong> 使用系统字体栈，不自托管 Apple / Microsoft 字体。
                  </p>
                  <p>
                    <strong>可嵌入字体：</strong> 跨平台统一时优先选择 Noto Sans CJK SC 或 Source Han Sans SC，并保留对应许可文本。
                  </p>
                </div>
                <div className="mt-5 rounded-[14px] border border-line bg-white p-4 font-mono text-xs leading-6 text-gray-6">
                  -apple-system, BlinkMacSystemFont, &quot;SF Pro Text&quot;, &quot;PingFang SC&quot;, &quot;Microsoft YaHei&quot;, &quot;Noto Sans CJK SC&quot;, sans-serif
                </div>
              </div>
              <div className="overflow-hidden rounded-[18px] border border-line">
                <table className="w-full border-collapse bg-white text-left text-sm">
                  <thead className="bg-gray-1 text-xs font-bold text-muted">
                    <tr>
                      <th className="px-4 py-3">平台</th>
                      <th className="px-4 py-3">层级</th>
                      <th className="px-4 py-3">字号 / 行高</th>
                      <th className="px-4 py-3">字重</th>
                      <th className="px-4 py-3">用途</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typographyRows.map((row) => (
                      <tr key={`${row.platform}-${row.role}`} className="border-t border-line">
                        <td className="px-4 py-3 font-semibold text-black">{row.platform}</td>
                        <td className="px-4 py-3">{row.role}</td>
                        <td className="px-4 py-3 font-mono text-xs text-muted">{row.size}</td>
                        <td className="px-4 py-3">{row.weight}</td>
                        <td className="px-4 py-3 text-muted">{row.usage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <Section eyebrow="05 Components" title="组件与状态规范">
            <div className="grid gap-5 xl:grid-cols-3">
              <div className="rounded-[18px] border border-line p-5">
                <h3 className="text-lg font-bold text-black">按钮</h3>
                <div className="mt-5 grid gap-3">
                  <button className="h-11 rounded-[12px] bg-primary px-4 text-sm font-bold text-white">主按钮</button>
                  <button className="h-11 rounded-[12px] border border-line bg-white px-4 text-sm font-bold text-black">次按钮</button>
                  <button className="h-11 rounded-[12px] bg-secondary-bg px-4 text-sm font-bold text-secondary">AI 按钮</button>
                  <button className="h-11 rounded-[12px] border border-danger bg-white px-4 text-sm font-bold text-danger">危险按钮</button>
                </div>
              </div>
              <div className="rounded-[18px] border border-line p-5">
                <h3 className="text-lg font-bold text-black">状态标签</h3>
                <div className="mt-5 flex flex-wrap gap-2">
                  {statusTags.map((tag) => (
                    <span key={tag.label} className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: tag.bg, color: tag.text }}>
                      {tag.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-[18px] border border-line p-5">
                <h3 className="text-lg font-bold text-black">圆角系统</h3>
                <div className="mt-5 grid gap-3 text-sm text-muted">
                  <div className="flex items-center justify-between"><span>小控件</span><strong className="text-black">8px</strong></div>
                  <div className="flex items-center justify-between"><span>输入框 / 按钮</span><strong className="text-black">10-12px</strong></div>
                  <div className="flex items-center justify-between"><span>卡片</span><strong className="text-black">16px</strong></div>
                  <div className="flex items-center justify-between"><span>弹窗</span><strong className="text-black">20px</strong></div>
                  <div className="flex items-center justify-between"><span>Tag</span><strong className="text-black">999px</strong></div>
                </div>
              </div>
            </div>
          </Section>

          <Section eyebrow="06 AI Module" title="AI 模块表达规范">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[18px] bg-secondary-bg p-5">
                <div className="text-sm font-bold text-secondary">AI 今日洞察</div>
                <h3 className="mt-3 text-2xl font-bold leading-8 text-black">今日发现 1 条风险，建议先查看风险记录并同步负责人。</h3>
                <div className="mt-5 grid gap-3">
                  {["2 位成员未提交日报", "1 条日志包含阻塞信号", "总工时低于近 7 日均值"].map((item) => (
                    <div key={item} className="rounded-[12px] bg-white px-4 py-3 text-sm text-text">{item}</div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button className="rounded-[12px] bg-primary px-4 py-2 text-sm font-bold text-white">查看风险</button>
                  <button className="rounded-[12px] border border-line bg-white px-4 py-2 text-sm font-bold text-black">提醒未填报</button>
                  <button className="rounded-[12px] border border-line bg-white px-4 py-2 text-sm font-bold text-black">生成汇报</button>
                </div>
              </div>
              <div className="rounded-[18px] border border-line p-5">
                <h3 className="text-lg font-bold text-black">统一结构</h3>
                <div className="mt-4 grid gap-3 text-sm leading-7 text-muted">
                  <p><strong className="text-black">一句话结论：</strong> 先给判断，不让用户自己读数据。</p>
                  <p><strong className="text-black">关键证据：</strong> 用 2-3 条数据解释判断来源。</p>
                  <p><strong className="text-black">建议操作：</strong> 给出可点击动作，例如查看风险、提醒未填报、生成汇报。</p>
                  <p><strong className="text-black">语义转换：</strong> AI 识别出的风险必须转为红色，提醒转为橙色，完成转为绿色。</p>
                </div>
              </div>
            </div>
          </Section>

          <Section eyebrow="07 Calendar" title="AI 日历状态规范">
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="grid grid-cols-7 gap-2 rounded-[20px] bg-gray-1 p-4">
                {Array.from({ length: 35 }).map((_, index) => {
                  const day = index + 1;
                  const isToday = day === 27;
                  const isRisk = day === 26 || day === 27;
                  const isComplete = day === 25;

                  return (
                    <div
                      key={day}
                      className={`min-h-24 rounded-[16px] border p-3 ${isToday ? "border-primary bg-primary-bg" : "border-transparent bg-white"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-black">{day}</span>
                        {isRisk ? <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-bold text-danger">风险</span> : null}
                      </div>
                      <div className="mt-7 h-1.5 rounded-full bg-gray-2">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: isToday ? "33%" : isComplete ? "100%" : isRisk ? "66%" : "0%",
                            background: isComplete ? "#16A34A" : isRisk ? "#D97706" : "#0B57D0"
                          }}
                        />
                      </div>
                      <div className="mt-2 text-xs text-muted">{day > 27 ? "计划率" : "填报率"} {isToday ? "33%" : isComplete ? "100%" : isRisk ? "66%" : "0%"}</div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-[18px] border border-line p-5">
                <h3 className="text-lg font-bold text-black">状态图例</h3>
                <div className="mt-5 grid gap-4">
                  {calendarStates.map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <span className="mt-1 h-3 w-3 rounded-full" style={{ background: item.color }} />
                      <div>
                        <div className="text-sm font-bold text-black">{item.label}</div>
                        <div className="mt-1 text-sm text-muted">{item.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section eyebrow="08 Tokens" title="开发 Token">
            <pre className="overflow-auto rounded-[18px] bg-black p-5 text-xs leading-6 text-white">
              <code>{cssTokens}</code>
            </pre>
          </Section>
        </div>
      </div>
    </main>
  );
}
