import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.calendarseven.com"),
  title: {
    default: "七数AI Work Calendar AI｜让 AI 自动理解团队工作",
    template: "%s | 七数AI Work Calendar AI"
  },
  description:
    "七数AI Work Calendar AI 是面向企业团队的 AI 工作日历系统，支持日报、周报、月报、风险分析、日历看板和项目管理，帮助管理者看懂团队状态。",
  keywords: ["AI工作日历", "AI日报", "AI周报", "团队管理", "项目管理", "企业日报", "工作汇报", "风险分析"],
  openGraph: {
    title: "七数AI Work Calendar AI｜让 AI 自动理解团队工作",
    description:
      "七数AI Work Calendar AI 是面向企业团队的 AI 工作日历系统，支持日报、周报、月报、风险分析、日历看板和项目管理。",
    url: "https://www.calendarseven.com",
    siteName: "Work Calendar AI",
    locale: "zh_CN",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
