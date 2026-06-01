"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, Modal, Typography, message } from "antd";
import { ArrowRight, CalendarCheck2, Home, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { businessLeaderQuotes } from "@/lib/business-quotes";
import { AuthUser } from "@/lib/types";

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type PasswordResetRequestResponse = {
  ok: boolean;
  resetToken?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [resetForm] = Form.useForm();
  const [confirmResetForm] = Form.useForm();
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [leaderQuote, setLeaderQuote] = useState(businessLeaderQuotes[0]);

  useEffect(() => {
    const previousQuote = window.localStorage.getItem("work-calendar-ai-login-quote");
    const candidates = businessLeaderQuotes.filter((item) => item.quote !== previousQuote);
    const pool = candidates.length > 0 ? candidates : businessLeaderQuotes;
    const nextQuote = pool[Math.floor(Math.random() * pool.length)];
    window.localStorage.setItem("work-calendar-ai-login-quote", nextQuote.quote);
    setLeaderQuote(nextQuote);
  }, []);

  const login = useMutation({
    mutationFn: (values: { account: string; password: string }) =>
      apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          account: values.account,
          password: values.password
        })
      }),
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
      router.replace("/calendar");
    }
  });

  const requestPasswordReset = useMutation({
    mutationFn: (values: { email: string }) =>
      apiFetch<PasswordResetRequestResponse>("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: (data) => {
      setDevResetToken(data.resetToken ?? null);
      message.success("如果账号存在，系统会生成密码重置流程。");
    }
  });

  const confirmPasswordReset = useMutation({
    mutationFn: (values: { token: string; newPassword: string }) =>
      apiFetch<{ ok: boolean }>("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: () => {
      message.success("密码已重置，请使用新密码登录。");
      setResetModalOpen(false);
      setDevResetToken(null);
      resetForm.resetFields();
      confirmResetForm.resetFields();
    }
  });

  return (
    <main className="system-login-page min-h-screen">
      <header className="system-login-header">
        <button type="button" className="system-login-brand" onClick={() => router.push("/")}>
          <img src="/seven-ai-logo.png" alt="七数AI" />
          <span>Work Calendar AI</span>
        </button>
        <Button icon={<Home size={16} />} onClick={() => router.push("/")}>
          官网首页
        </Button>
      </header>

      <section className="system-login-shell">
        <div className="system-login-layout">
          <aside className="system-login-quote" aria-label="商业领袖语录">
            <p>“{leaderQuote.quote}”</p>
            <span>{leaderQuote.author}</span>
          </aside>

          <div className="system-login-panel">
            <Card className="system-login-card" styles={{ body: { padding: 0 } }}>
              <div className="system-login-card-inner">
                <div className="system-login-mark">
                  <CalendarCheck2 size={22} />
                </div>
                <Typography.Title level={1} className="system-login-title">
                  登录工作台
                </Typography.Title>
                <Typography.Text className="system-login-subtitle">已有账号进入 Work Calendar AI 工作台</Typography.Text>

                {login.error ? <Alert className="mt-5" type="error" message={(login.error as Error).message} showIcon /> : null}
                <Form className="system-login-form mt-6" layout="vertical" onFinish={(values) => login.mutate(values)}>
                  <Form.Item name="account" label="邮箱或手机号" rules={[{ required: true }]}>
                    <Input placeholder="请输入邮箱或手机号" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true }]}>
                    <Input.Password placeholder="请输入密码" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block icon={<LogIn size={16} />} loading={login.isPending}>
                    {login.isPending ? "正在验证身份…" : "进入工作台"}
                  </Button>
                </Form>

                <div className="system-login-links">
                  <Button type="link" onClick={() => setResetModalOpen(true)}>
                    忘记密码
                  </Button>
                  <button type="button" onClick={() => router.push("/")}>
                    <span>了解产品与免费试用</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </Card>
            <div className="system-login-note">
              系统入口：官网负责产品介绍与免费试用，登录页仅用于已有账号进入工作台。
            </div>
          </div>
        </div>
      </section>

      <footer className="system-login-footer">
        北京七数智联科技有限公司 · 企业数据按租户隔离，管理员可导出数据备份
      </footer>

      <Modal title="重置密码" open={resetModalOpen} onCancel={() => setResetModalOpen(false)} footer={null}>
        {requestPasswordReset.error ? <Alert className="mb-4" type="error" showIcon message={(requestPasswordReset.error as Error).message} /> : null}
        {confirmPasswordReset.error ? <Alert className="mb-4" type="error" showIcon message={(confirmPasswordReset.error as Error).message} /> : null}
        <Form form={resetForm} layout="vertical" onFinish={(values) => requestPasswordReset.mutate(values)}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email" }]}>
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Button htmlType="submit" loading={requestPasswordReset.isPending}>
            获取重置令牌
          </Button>
        </Form>
        {devResetToken ? (
          <Alert className="my-4" type="info" showIcon message="本地演示重置令牌" description={devResetToken} />
        ) : null}
        <Form form={confirmResetForm} layout="vertical" onFinish={(values) => confirmPasswordReset.mutate(values)}>
          <Form.Item name="token" label="重置令牌" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={confirmPasswordReset.isPending}>
            确认重置密码
          </Button>
        </Form>
      </Modal>
    </main>
  );
}
