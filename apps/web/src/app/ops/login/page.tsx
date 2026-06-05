"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AuthUser } from "@/lib/types";

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

export default function OpsLoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);

  const login = useMutation({
    mutationFn: async (values: { password: string }) => {
      const data = await apiFetch<LoginResponse>("/auth/ops-login", {
        method: "POST",
        body: JSON.stringify({ password: values.password })
      });
      if (!data.user.roles.includes("SUPER_ADMIN")) {
        throw new Error("当前口令未获得平台运维权限");
      }
      return data;
    },
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
      router.replace("/ops");
    }
  });

  return (
    <main className="login-stage flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="login-orbit login-orbit-a" />
      <div className="login-orbit login-orbit-b" />
      <div className="absolute left-5 top-5 z-10 flex h-8 w-[96px] items-center">
        <img src="/seven-ai-logo.png" alt="七数AI" className="h-7 w-full object-contain opacity-75" />
      </div>
      <div className="relative z-10 w-full max-w-[460px]">
        <Card className="login-card surface-panel w-full border-0" styles={{ body: { padding: 34 } }}>
          <div className="mb-5 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-muted">
              <ShieldCheck size={16} />
              开发公司运维控制台
            </div>
          </div>
          <Typography.Title level={2} className="!mb-1 !text-center !font-medium">
            七数AI 运维端
          </Typography.Title>
          <Typography.Text className="block text-center text-muted">北京七数智联科技有限公司</Typography.Text>
          {login.error ? <Alert className="mt-5" type="error" message={(login.error as Error).message} showIcon /> : null}
          <Form
            className="mt-6"
            layout="vertical"
            onFinish={(values) => login.mutate(values)}
          >
            <Form.Item name="password" label="运维口令" rules={[{ required: true }]}>
              <Input.Password placeholder="请输入服务器配置的 OPS_ADMIN_PASSWORD" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={login.isPending}>
              登录运维端
            </Button>
            <Button className="mt-3" block icon={<ArrowLeft size={16} />} onClick={() => router.push("/login")}>
              返回企业登录
            </Button>
          </Form>
        </Card>
      </div>
    </main>
  );
}
