"use client";

import "antd/dist/reset.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { ReactNode, useState } from "react";

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
          colorError: "#DC2626",
          colorText: "#111827",
          colorTextSecondary: "#6B7280",
          colorBorder: "#E5E7EB",
          colorBgLayout: "#F8FAFC",
          colorBgContainer: "#ffffff",
          colorFillSecondary: "#F3F6FA",
          borderRadius: 10,
          controlHeight: 40,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)"
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
            borderColor: "#E5E7EB",
            headerBg: "#F8FAFC",
            headerColor: "#6B7280",
            rowHoverBg: "#EEF5FF"
          },
          Tabs: {
            itemSelectedColor: "#0B57D0",
            inkBarColor: "#0B57D0"
          },
          Tag: {
            borderRadiusSM: 999
          },
          Layout: { headerBg: "#ffffff", siderBg: "#F8FAFC" },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: "rgba(11, 87, 208, 0.08)",
            itemSelectedColor: "#0B57D0",
            itemHoverBg: "#F3F6FA",
            itemBorderRadius: 10
          }
        }
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  );
}
