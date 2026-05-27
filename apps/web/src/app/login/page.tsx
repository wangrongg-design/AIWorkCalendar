"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, Modal, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck2, CheckCircle2, Sparkles } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { AuthUser } from "@/lib/types";

type LoginResponse = {
  accessToken: string;
  user: AuthUser;
};

type PasswordResetRequestResponse = {
  ok: boolean;
  resetToken?: string;
};

const aiCapabilities = [
  "AI 自动生成日报、周报、月报",
  "AI 自动分析团队风险和项目阻塞",
  "管理者可在日历中查看团队状态",
  "工作记录自动沉淀为企业知识"
];

const loginInsights = [
  "本周团队填报率较上周提升 18%",
  "研发项目存在 1 个延期风险",
  "AI 已为团队生成本周工作摘要"
];

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [resetForm] = Form.useForm();
  const [confirmResetForm] = Form.useForm();
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: (values: { account: string; password: string }) =>
      apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
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
    <main className="login-stage login-product-stage flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="login-top-brand">
        <img src="/seven-ai-logo.png" alt="七数AI" />
        <span>Work Calendar AI</span>
      </div>
      <div className="login-timeline" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className={index === 4 ? "is-today" : ""}>
            <span>{index + 12}</span>
          </div>
        ))}
      </div>
      <div className="relative z-10 grid w-full max-w-6xl items-center gap-8 px-2 py-16 lg:grid-cols-[1fr_460px]">
        <section className="login-value-panel hidden min-h-[560px] flex-col justify-between lg:flex">
          <div>
            <div className="login-brand-lockup">
              <img src="/seven-ai-logo.png" alt="七数AI" />
              <div>
                <div>Work Calendar AI</div>
                <span>企业 AI 工作操作系统</span>
              </div>
            </div>
            <Typography.Title className="login-value-title">
              AI 自动理解团队工作，而不只是收集日报。
            </Typography.Title>
            <div className="login-value-english">Your AI-powered team operating system.</div>
            <Typography.Text className="login-value-copy">
              让团队的日报、计划、项目进展和风险问题自动沉淀为可分析、可追踪、可复盘的工作数据。
            </Typography.Text>
            <div className="login-capability-list">
              {aiCapabilities.map((item) => (
                <div key={item}>
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="login-intelligence">
            <div className="login-ai-status">
              <div>
                <span className="login-live-dot" />
                AI 正在分析今日团队工作…
              </div>
              <Sparkles size={18} />
            </div>
            <div className="login-insight-card">
              <div className="login-insight-title">AI 今日洞察</div>
              <div className="login-insight-list">
                {loginInsights.map((item) => (
                  <div key={item}>
                    <CheckCircle2 size={15} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="login-signal-grid">
              {[
                { label: "日报", value: "可追踪" },
                { label: "风险", value: "可分析" },
                { label: "知识", value: "可沉淀" }
              ].map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Card className="login-card login-form-card surface-panel w-full border-0" styles={{ body: { padding: 36 } }}>
          <div className="mb-5 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-muted">
              <CalendarCheck2 size={16} />
              AI 驱动的团队工作流
            </div>
          </div>
          <Typography.Title level={2} className="!mb-1 !text-center !font-medium">
            进入 Work Calendar AI
          </Typography.Title>
          <Typography.Text className="block text-center text-muted">使用企业账号登录你的 AI 工作空间</Typography.Text>
          {login.error ? <Alert className="mt-5" type="error" message={(login.error as Error).message} showIcon /> : null}
          <Form
            className="login-form mt-6"
            layout="vertical"
            onFinish={(values) => login.mutate(values)}
          >
            <Form.Item name="account" label="邮箱或手机号" rules={[{ required: true }]}>
              <Input placeholder="请输入邮箱或手机号" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true }]}>
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
            <Button className="login-submit" type="primary" htmlType="submit" block loading={login.isPending}>
              {login.isPending ? "AI 正在验证企业身份…" : "进入工作空间"}
            </Button>
            <Button className="login-forgot-link" type="link" block onClick={() => setResetModalOpen(true)}>
              忘记密码
            </Button>
            <button className="login-create-link" type="button" onClick={() => router.push("/")}>
              <span>没有企业账号？</span>
              <strong>立即创建 AI 工作空间</strong>
              <ArrowRight size={15} />
            </button>
          </Form>
        </Card>
      </div>
      <footer className="absolute bottom-5 left-0 right-0 z-10 px-4 text-center text-xs leading-6 text-muted">
        <div>北京七数智联科技有限公司</div>
        <div>企业数据均保密，管理员可随时导出备份。</div>
      </footer>
      <Modal
        title="重置密码"
        open={resetModalOpen}
        onCancel={() => setResetModalOpen(false)}
        footer={null}
      >
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
          <Alert
            className="my-4"
            type="info"
            showIcon
            message="本地演示重置令牌"
            description={devResetToken}
          />
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
