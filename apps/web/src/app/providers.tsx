"use client";

import "antd/dist/reset.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { ReactNode, useState } from "react";

dayjs.locale("zh-cn");

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#0B57D0",
          colorInfo: "#0B57D0",
          colorSuccess: "#16A34A",
          colorWarning: "#D97706",
          colorError: "#EE3B2B",
          colorText: "#1A1A1A",
          colorTextSecondary: "#737373",
          colorTextTertiary: "#A3A3A3",
          colorBorder: "#E6E6E6",
          colorBorderSecondary: "#E6E6E6",
          colorBgLayout: "#F6F6F6",
          colorBgContainer: "#FFFFFF",
          colorFillSecondary: "#F6F6F6",
          borderRadius: 10,
          controlHeight: 40,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
          boxShadow: "0 10px 28px rgba(26, 26, 26, 0.06)"
        },
        components: {
          Button: {
            borderRadius: 10,
            controlHeight: 40,
            primaryShadow: "none"
          },
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: "none"
          },
          Input: {
            borderRadius: 10,
            controlHeight: 40
          },
          InputNumber: {
            borderRadius: 10,
            controlHeight: 40
          },
          Select: {
            borderRadius: 10,
            controlHeight: 40
          },
          DatePicker: {
            borderRadius: 10,
            controlHeight: 40
          },
          Modal: {
            borderRadiusLG: 20
          },
          Table: {
            borderColor: "#E6E6E6",
            headerBg: "#F6F6F6",
            headerColor: "#737373",
            rowHoverBg: "#EEF5FF"
          },
          Tabs: {
            itemSelectedColor: "#0B57D0",
            inkBarColor: "#0B57D0"
          },
          Tag: {
            borderRadiusSM: 999
          },
          Layout: { headerBg: "#FFFFFF", siderBg: "#F6F6F6" },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: "rgba(11, 87, 208, 0.08)",
            itemSelectedColor: "#0B57D0",
            itemHoverBg: "#EEF5FF",
            itemBorderRadius: 10
          }
        }
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  );
}
