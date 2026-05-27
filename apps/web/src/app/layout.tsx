import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://calendar.sevendata.cn"),
  title: {
    default: "七数AI Work Calendar AI",
    template: "%s | 七数AI Work Calendar AI"
  },
  description: "让 AI 自动理解团队工作。企业免费试用1个月，正式使用 ¥19 / 启用成员 / 月。",
  openGraph: {
    title: "七数AI Work Calendar AI",
    description: "AI 自动生成日报、周报、月报和团队风险分析的企业工作日历。",
    url: "https://calendar.sevendata.cn",
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
