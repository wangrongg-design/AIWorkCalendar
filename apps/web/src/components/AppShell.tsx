"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Tooltip, Typography } from "antd";
import type { MenuProps } from "antd";
import { Bell, CalendarDays, ClipboardList, FileText, FolderKanban, LogOut, PanelLeftClose, PanelLeftOpen, Users } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { Notification } from "@/lib/types";

const { Sider, Content } = Layout;

const dailyNavItems: MenuProps["items"] = [
  { key: "/dashboard", icon: <CalendarDays size={19} />, label: "工作台" },
  { key: "/calendar", icon: <CalendarDays size={19} />, label: "日历" },
  { key: "/work-logs", icon: <ClipboardList size={19} />, label: "日报" },
  { key: "/reports", icon: <FileText size={19} />, label: "AI汇报" }
];

const adminNavItems: MenuProps["items"] = [
  { key: "/projects", icon: <FolderKanban size={19} />, label: "项目" },
  { key: "/org", icon: <Users size={19} />, label: "团队" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [router, token]);

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<Notification[]>("/notifications"),
    enabled: Boolean(token),
    refetchInterval: 30000
  });

  const markNotification = useMutation({
    mutationFn: (id: string) => apiFetch<Notification>(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });

  const markAllNotifications = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/notifications/read-all", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });

  const unreadCount = notifications.data?.filter((item) => !item.isRead).length ?? 0;
  const notificationMenu: MenuProps["items"] =
    notifications.data?.length
      ? [
          ...(unreadCount
            ? [
                {
                  key: "read-all",
                  label: <span className="font-medium text-primary">全部标为已读</span>
                }
              ]
            : []),
          ...notifications.data.slice(0, 8).map((item) => ({
            key: item.id,
            label: (
              <div className="w-72">
                <div className="flex items-center gap-2">
                  {!item.isRead ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                  <div className="font-medium text-ink">{item.title}</div>
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-muted">{item.body}</div>
              </div>
            )
          }))
        ]
      : [];

  if (!token || !user) {
    return null;
  }

  const canUseAdminMenu = user.roles.includes("COMPANY_ADMIN") || user.roles.includes("SUPER_ADMIN");
  const selectedKeys = [pathname];

  return (
    <Layout className="min-h-screen">
      <Sider
        width={296}
        collapsedWidth={88}
        collapsed={collapsed}
        trigger={null}
        className="app-sidebar border-r border-line bg-surface"
      >
        <div className="flex min-h-screen flex-col">
          <div className={`flex h-[76px] items-center gap-3 ${collapsed ? "justify-center px-3" : "px-5"}`}>
            <div className={`flex h-8 shrink-0 items-center ${collapsed ? "w-12 justify-center" : "w-28"}`}>
              <img src="/seven-ai-logo.png" alt="七数AI" className="h-7 w-full object-contain opacity-75" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <Typography.Text className="block truncate text-base font-medium text-ink">Work Calendar AI</Typography.Text>
                <Typography.Text className="app-sidebar-subtext block text-xs text-muted">{user.tenantName}</Typography.Text>
              </div>
            ) : null}
          </div>

          <div className="px-3">
            <Tooltip title={collapsed ? (user.departmentName ?? "全公司") : undefined} placement="right">
              <div className={`mb-3 rounded-[18px] bg-surface-container px-4 py-3 ${collapsed ? "text-center" : ""}`}>
                {!collapsed ? <div className="text-xs font-medium text-muted">可见范围</div> : null}
                <div className="truncate text-sm font-medium text-ink">{collapsed ? (user.departmentName ? user.departmentName.slice(0, 1) : "全") : (user.departmentName ?? "全公司")}</div>
              </div>
            </Tooltip>
          </div>

          <div className="sidebar-menu-section">
            {!collapsed ? <div className="sidebar-menu-label">日常工作</div> : null}
            <Menu
              mode="inline"
              inlineCollapsed={collapsed}
              selectedKeys={selectedKeys}
              items={dailyNavItems}
              onClick={(item) => router.push(item.key)}
              className="material-nav border-r-0 bg-transparent px-3"
            />
          </div>

          {canUseAdminMenu ? (
            <div className="sidebar-menu-section">
              {!collapsed ? <div className="sidebar-menu-label">企业管理</div> : null}
              <Menu
                mode="inline"
                inlineCollapsed={collapsed}
                selectedKeys={selectedKeys}
                items={adminNavItems}
                onClick={(item) => router.push(item.key)}
                className="material-nav border-r-0 bg-transparent px-3"
              />
            </div>
          ) : null}

          <div className="mt-auto px-3 pb-4">
            <div className={`mb-3 flex items-center gap-2 rounded-[18px] bg-surface-container p-2 ${collapsed ? "justify-center" : ""}`}>
              <Dropdown
                menu={{
                  items: notificationMenu.length ? notificationMenu : [{ key: "empty", label: "暂无通知" }],
                  onClick: ({ key }) => {
                    if (key === "empty") return;
                    if (key === "read-all") {
                      markAllNotifications.mutate();
                      return;
                    }
                    markNotification.mutate(String(key));
                  }
                }}
                trigger={["click"]}
                placement="topRight"
              >
                <Button
                  type="text"
                  shape="circle"
                  icon={
                    <Badge size="small" count={unreadCount}>
                      <Bell size={18} />
                    </Badge>
                  }
                />
              </Dropdown>

              {!collapsed ? (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-ink">通知</div>
                  <div className="truncate text-xs text-muted">{unreadCount ? `${unreadCount} 条未读` : "暂无未读"}</div>
                </div>
              ) : null}
            </div>

            <div className={`mb-3 flex items-center gap-3 rounded-[18px] bg-surface-container p-2 ${collapsed ? "justify-center" : ""}`}>
              <Avatar size={34} className="shrink-0 bg-primary text-white">
                {user.name.slice(0, 1)}
              </Avatar>
              {!collapsed ? (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-5 text-ink">{user.name}</div>
                    <div className="app-sidebar-subtext text-xs leading-4 text-muted">{user.roles.join(" / ")}</div>
                  </div>
                  <Button
                    type="text"
                    shape="circle"
                    icon={<LogOut size={16} />}
                    onClick={() => {
                      clearSession();
                      router.replace("/login");
                    }}
                  />
                </>
              ) : null}
            </div>

            {collapsed ? (
              <Tooltip title="退出登录" placement="right">
                <Button
                  className="mb-3"
                  block
                  type="text"
                  icon={<LogOut size={16} />}
                  onClick={() => {
                    clearSession();
                    router.replace("/login");
                  }}
                />
              </Tooltip>
            ) : null}

            <div className={`flex ${collapsed ? "justify-center" : "justify-end"}`}>
              <Tooltip title={collapsed ? "展开侧边栏" : "收起侧边栏"} placement={collapsed ? "right" : "top"}>
                <Button
                  className="text-muted"
                  type="text"
                  shape="circle"
                  size="small"
                  icon={collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                  onClick={() => setCollapsed((value) => !value)}
                />
              </Tooltip>
            </div>
          </div>
        </div>
      </Sider>
      <Layout>
        <Content className="px-6 py-5">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
