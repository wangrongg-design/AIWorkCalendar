"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, Modal, Typography, message } from "antd";
import { ArrowRight, Building2, CalendarCheck2, Home, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { businessLeaderQuotes } from "@/lib/business-quotes";
import { AuthUser } from "@/lib/types";

type LoginValues = {
  account: string;
  password: string;
  tenantId?: string;
};

type TenantSelectionOption = {
  tenantId: string;
  tenantName: string;
  tenantCode: string;
  tenantLogoUrl?: string | null;
  userName: string;
  departmentName?: string | null;
};

type AuthenticatedLoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type TenantSelectionLoginResponse = {
  requiresTenantSelection: true;
  options: TenantSelectionOption[];
};

type LoginResponse = AuthenticatedLoginResponse | TenantSelectionLoginResponse;

type PasswordResetRequestResponse = {
  ok: boolean;
  resetToken?: string;
};

function isTenantSelectionResponse(data: LoginResponse): data is TenantSelectionLoginResponse {
  return "requiresTenantSelection" in data && data.requiresTenantSelection;
}

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [resetForm] = Form.useForm();
  const [confirmResetForm] = Form.useForm();
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [leaderQuote, setLeaderQuote] = useState(businessLeaderQuotes[0]);
  const [tenantSelectionOpen, setTenantSelectionOpen] = useState(false);
  const [tenantOptions, setTenantOptions] = useState<TenantSelectionOption[]>([]);
  const [pendingLogin, setPendingLogin] = useState<LoginValues | null>(null);

  useEffect(() => {
    const previousQuote = window.localStorage.getItem("work-calendar-ai-login-quote");
    const candidates = businessLeaderQuotes.filter((item) => item.quote !== previousQuote);
    const pool = candidates.length > 0 ? candidates : businessLeaderQuotes;
    const nextQuote = pool[Math.floor(Math.random() * pool.length)];
    window.localStorage.setItem("work-calendar-ai-login-quote", nextQuote.quote);
    setLeaderQuote(nextQuote);
  }, []);

  const login = useMutation({
    mutationFn: (values: LoginValues) =>
      apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          account: values.account,
          password: values.password,
          tenantId: values.tenantId
        })
      }),
    onSuccess: (data) => {
      if (isTenantSelectionResponse(data)) {
        setTenantOptions(data.options);
        setTenantSelectionOpen(true);
        return;
      }
      setSession(data.accessToken, data.user);
      setTenantSelectionOpen(false);
      setTenantOptions([]);
      setPendingLogin(null);
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

  const submitLogin = (values: LoginValues) => {
    const nextLogin = { account: values.account, password: values.password };
    setPendingLogin(nextLogin);
    login.mutate(nextLogin);
  };

  const selectTenant = (option: TenantSelectionOption) => {
    if (!pendingLogin) return;
    login.mutate({ ...pendingLogin, tenantId: option.tenantId });
  };

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
                  登录 Work Calendar AI
                </Typography.Title>
                <Typography.Text className="system-login-subtitle">进入企业工作台，查看日报、项目、风险和 AI 汇报。</Typography.Text>

                {login.error ? <Alert className="mt-5" type="error" message={(login.error as Error).message} showIcon /> : null}
                <Form className="system-login-form mt-6" layout="vertical" onFinish={submitLogin}>
                  <Form.Item name="account" label="手机号或邮箱" rules={[{ required: true }]}>
                    <Input placeholder="请输入手机号或邮箱" />
                  </Form.Item>
                  <Form.Item name="password" label="密码" rules={[{ required: true }]}>
                    <Input.Password placeholder="请输入密码" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block icon={<LogIn size={16} />} loading={login.isPending}>
                    {login.isPending ? "正在验证身份…" : "登录"}
                  </Button>
                </Form>

                <div className="system-login-links">
                  <Button type="link" onClick={() => setResetModalOpen(true)}>
                    忘记密码
                  </Button>
                  <button type="button" onClick={() => router.push("/#signup")}>
                    <span>注册企业</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </Card>
            <div className="system-login-note">
              登录后进入工作台。
            </div>
          </div>
        </div>
      </section>

      <footer className="system-login-footer">
        北京七数智联科技有限公司 · 企业数据按租户隔离，管理员可导出数据备份
      </footer>

      <Modal
        title="选择要进入的企业"
        open={tenantSelectionOpen}
        onCancel={() => setTenantSelectionOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Typography.Text className="tenant-choice-copy">
          这个账号已加入多个企业，请选择本次要进入的工作空间。
        </Typography.Text>
        {login.error ? <Alert className="mt-4" type="error" showIcon message={(login.error as Error).message} /> : null}
        <div className="tenant-choice-list">
          {tenantOptions.map((option) => (
            <button
              key={option.tenantId}
              type="button"
              className="tenant-choice-row"
              disabled={login.isPending}
              onClick={() => selectTenant(option)}
            >
              <span className="tenant-choice-logo">
                {option.tenantLogoUrl ? <img src={option.tenantLogoUrl} alt="" /> : <Building2 size={18} />}
              </span>
              <span className="tenant-choice-body">
                <strong>{option.tenantName}</strong>
                <span>统一社会信用代码 {option.tenantCode}</span>
                <em>{option.departmentName ? `${option.userName} · ${option.departmentName}` : option.userName}</em>
              </span>
            </button>
          ))}
        </div>
      </Modal>

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
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true }, { min: 6, message: "新密码至少 6 位" }]}>
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
