"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, Modal, Typography, message } from "antd";
import { useRouter } from "next/navigation";
import { CalendarCheck2, Quote } from "lucide-react";
import { useEffect, useState } from "react";
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

const leaderQuotes = [
  { text: "关注客户，而不是竞争对手。", name: "Jeff Bezos" },
  { text: "在不得不改变之前，先主动改变。", name: "Jack Welch" },
  { text: "风险来自你不知道自己在做什么。", name: "Warren Buffett" },
  { text: "创新区分领导者和追随者。", name: "Steve Jobs" },
  { text: "行业尊重创新，而不是传统。", name: "Satya Nadella" },
  { text: "把复杂留给系统，把简单交给用户。", name: "Bill Gates" },
  { text: "伟大的公司先解决真实问题。", name: "Elon Musk" },
  { text: "长期主义，是商业最稳定的复利。", name: "Indra Nooyi" }
];

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const [resetForm] = Form.useForm();
  const [confirmResetForm] = Form.useForm();
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const selectedQuote = leaderQuotes[quoteIndex];

  useEffect(() => {
    setQuoteIndex(Math.floor(Math.random() * leaderQuotes.length));
  }, []);

  const login = useMutation({
    mutationFn: (values: { account: string; password: string; tenantCode?: string }) =>
      apiFetch<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: (data) => {
      setSession(data.accessToken, data.user);
      router.replace("/dashboard");
    }
  });

  const requestPasswordReset = useMutation({
    mutationFn: (values: { email: string; tenantCode?: string }) =>
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
    <main className="login-stage flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4">
      <div className="login-orbit login-orbit-a" />
      <div className="login-orbit login-orbit-b" />
      <div className="absolute left-5 top-5 z-10 flex h-8 w-[96px] items-center">
        <img src="/seven-ai-logo.png" alt="七数AI" className="h-7 w-full object-contain opacity-75" />
      </div>
      <div className="login-timeline" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, index) => (
          <div key={index} className={index === 4 ? "is-today" : ""}>
            <span>{index + 12}</span>
          </div>
        ))}
      </div>
      <div className="relative z-10 grid w-full max-w-6xl items-center gap-8 px-2 py-16 lg:grid-cols-[1fr_460px]">
        <section className="hidden min-h-[520px] flex-col justify-between rounded-[28px] bg-white/60 p-8 shadow-sm ring-1 ring-line lg:flex">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-muted">
              <Quote size={16} />
              国际商业领袖
            </div>
            <Typography.Title className="!mb-5 !mt-8 !max-w-xl !text-[34px] !font-medium !leading-tight">
              “{selectedQuote.text}”
            </Typography.Title>
            <Typography.Text className="text-base text-muted">{selectedQuote.name}</Typography.Text>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="metric-card bg-white">
              <div className="metric-label">填报闭环</div>
              <div className="mt-1 text-lg font-medium">日报 / 计划</div>
            </div>
            <div className="metric-card bg-white">
              <div className="metric-label">管理视图</div>
              <div className="mt-1 text-lg font-medium">月历看板</div>
            </div>
            <div className="metric-card bg-white">
              <div className="metric-label">AI 输出</div>
              <div className="mt-1 text-lg font-medium">日报周报</div>
            </div>
          </div>
        </section>

        <Card className="login-card surface-panel w-full border-0" styles={{ body: { padding: 34 } }}>
          <div className="mb-5 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-surface-container px-4 py-2 text-sm font-medium text-muted">
              <CalendarCheck2 size={16} />
              日报、计划、AI 汇报
            </div>
          </div>
          <Typography.Title level={2} className="!mb-1 !text-center !font-medium">
            Work Calendar AI
          </Typography.Title>
          <Typography.Text className="block text-center text-muted">企业工作填报与智能汇报</Typography.Text>
          {login.error ? <Alert className="mt-5" type="error" message={(login.error as Error).message} showIcon /> : null}
          <Form
            className="mt-6"
            layout="vertical"
            initialValues={{ tenantCode: "demo", account: "admin@example.com", password: "Passw0rd!" }}
            onFinish={(values) => login.mutate(values)}
          >
            <Form.Item name="tenantCode" label="企业代码">
              <Input placeholder="demo" />
            </Form.Item>
            <Form.Item name="account" label="邮箱或手机号" rules={[{ required: true }]}>
              <Input placeholder="admin@example.com / 13900000002" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true }]}>
              <Input.Password placeholder="Passw0rd!" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={login.isPending}>
              登录
            </Button>
            <Button type="link" block onClick={() => setResetModalOpen(true)}>
              忘记密码
            </Button>
            <Button className="mt-3" block onClick={() => router.push("/")}>
              注册新企业，查看价格并免费试用
            </Button>
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
          <Form.Item name="tenantCode" label="企业代码">
            <Input placeholder="demo" />
          </Form.Item>
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
