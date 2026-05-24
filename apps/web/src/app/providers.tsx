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
          colorPrimary: "#0b57d0",
          colorInfo: "#0b57d0",
          colorSuccess: "#0f766e",
          colorWarning: "#b06000",
          colorError: "#b3261e",
          colorText: "#1f1f1f",
          colorTextSecondary: "#5f6368",
          colorBorder: "#dadce0",
          colorBgLayout: "#f8fafd",
          colorBgContainer: "#ffffff",
          colorFillSecondary: "#eef3f8",
          borderRadius: 12,
          controlHeight: 40,
          fontFamily:
            '"Google Sans", Roboto, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
          boxShadow:
            "0 1px 2px rgba(60, 64, 67, 0.18), 0 1px 3px 1px rgba(60, 64, 67, 0.08)"
        },
        components: {
          Button: {
            borderRadius: 20,
            controlHeight: 40,
            primaryShadow: "none"
          },
          Card: {
            borderRadiusLG: 16,
            boxShadowTertiary: "none"
          },
          Input: {
            borderRadius: 12,
            controlHeight: 40
          },
          InputNumber: {
            borderRadius: 12,
            controlHeight: 40
          },
          Select: {
            borderRadius: 12,
            controlHeight: 40
          },
          DatePicker: {
            borderRadius: 12,
            controlHeight: 40
          },
          Modal: {
            borderRadiusLG: 20
          },
          Table: {
            borderColor: "#e6e9ef",
            headerBg: "#f8fafd",
            headerColor: "#5f6368",
            rowHoverBg: "#f1f6ff"
          },
          Tabs: {
            itemSelectedColor: "#0b57d0",
            inkBarColor: "#0b57d0"
          },
          Tag: {
            borderRadiusSM: 999
          },
          Layout: { headerBg: "#ffffff", siderBg: "#f8fafd" },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: "#d3e3fd",
            itemSelectedColor: "#041e49",
            itemHoverBg: "#eef3f8",
            itemBorderRadius: 999
          }
        }
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConfigProvider>
  );
}
