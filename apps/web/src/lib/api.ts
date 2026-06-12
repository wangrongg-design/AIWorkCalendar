"use client";

import { useAuthStore } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function messageFromBody(message: string | string[] | undefined, fallback: string) {
  if (Array.isArray(message)) return message.join("; ");
  return message || fallback;
}

export function humanizeApiError(message: string, status?: number, path = "", method = "GET") {
  const normalized = message.toLowerCase();
  const upperMethod = method.toUpperCase();
  const isAttachmentEndpoint = path.includes("/attachments");
  const isLoginEndpoint = path === "/auth/login";
  const isOpsLoginEndpoint = path === "/auth/ops-login";

  if (isAttachmentEndpoint && upperMethod === "POST" && (status === 404 || normalized.includes("not found"))) {
    return "演示环境暂不支持附件上传。可以先保存日报正文，稍后在正式环境补充附件。";
  }
  if (isAttachmentEndpoint && (status === 404 || normalized.includes("attachment") || normalized.includes("not a file"))) {
    return "附件暂时不可用，可能已被删除或移动。请刷新页面后重试，必要时重新上传。";
  }
  if (isLoginEndpoint && (status === 401 || normalized.includes("unauthorized"))) {
    if (normalized.includes("platform ops login")) {
      return "平台超级管理员请从运维端入口使用运维口令登录。";
    }
    if (normalized.includes("temporarily locked")) {
      return "账号因连续登录失败被临时锁定，请稍后再试或联系企业管理员。";
    }
    if (normalized.includes("email is not verified")) {
      return "邮箱尚未验证，请先完成邮箱验证后再登录。";
    }
    if (normalized.includes("inactive")) {
      return "账号已停用，请联系企业管理员恢复后再登录。";
    }
    return "账号或密码不正确，请检查手机号/邮箱和密码。";
  }
  if (isOpsLoginEndpoint && (status === 401 || normalized.includes("unauthorized"))) {
    if (normalized.includes("not configured")) {
      return "运维口令尚未配置，请在服务器环境变量 OPS_ADMIN_PASSWORD 中设置后重启服务。";
    }
    return "运维口令不正确，请检查服务器配置的 OPS_ADMIN_PASSWORD。";
  }
  if (status === 401 || normalized.includes("unauthorized")) {
    return "登录状态已失效，请重新登录后继续操作。";
  }
  if (status === 403 || normalized.includes("forbidden")) {
    return "当前账号没有权限执行这个操作，请联系企业管理员开通权限。";
  }
  if (normalized.includes("user not found")) {
    return "没有找到这个账号，可能账号不存在或已停用。请检查账号，或联系企业管理员。";
  }
  if (normalized.includes("account not found")) {
    return "没有找到这个账号，可能账号已删除或不属于当前运维范围。请刷新账号列表后重试。";
  }
  if (normalized.includes("cannot deactivate your own ops account")) {
    return "不能停用当前登录的运维账号。";
  }
  if (normalized.includes("tenant not found")) {
    return "没有找到对应企业，请检查统一社会信用代码或企业信息后重试。";
  }
  if (normalized.includes("work log not found")) {
    return "没有找到这条填报记录，可能已被删除。请刷新列表后重试。";
  }
  if (normalized.includes("project not found")) {
    return "没有找到这个项目，可能已归档或被删除。请刷新项目列表后重试。";
  }
  if (normalized.includes("report not found")) {
    return "没有找到这份报告，可能已被删除。请刷新报告列表后重试。";
  }
  if (normalized.includes("order not found")) {
    return "没有找到这笔订单，可能已过期。请刷新订阅订单后重试。";
  }
  if (normalized.includes("payment is not configured") || normalized.includes("支付暂未配置") || normalized.includes("支付配置不完整")) {
    return "当前支付方式暂未开通，请先切换其他支付方式，或联系运维人员完成商户配置。";
  }
  if (normalized.includes("当前密码不正确")) {
    return "当前密码不正确，请重新输入旧密码后再更新。";
  }
  if (normalized.includes("请至少填写邮箱或手机号")) {
    return "邮箱和手机号至少填写一个，请补充联系方式后再保存。";
  }
  if (normalized.includes("邮箱或手机号已被当前企业其他账号使用")) {
    return "邮箱或手机号已被当前企业其他账号使用，请更换联系方式后再保存。";
  }
  if (normalized.includes("手机号格式不正确")) {
    return "手机号格式不正确，请输入 6 到 20 位数字，国际号码可加 +。";
  }
  if (normalized.includes("请为成员选择一个企业内角色")) {
    return "请选择一个有效的企业内角色后再保存。";
  }
  if (normalized.includes("不能移除当前登录账号的企业管理员权限")) {
    return "不能移除当前登录账号的企业管理员权限。请先指定另一个企业管理员后再操作。";
  }
  if (normalized.includes("至少保留一个可登录的企业管理员")) {
    return "至少保留一个可登录的企业管理员。请先新增或指定另一个企业管理员后再修改。";
  }
  if (normalized.includes("当前企业订阅不可用")) {
    return "当前企业订阅不可用，请续费或联系平台管理员后再新增或启用员工。";
  }
  if (normalized.includes("live payments must be confirmed") || normalized.includes("provider callback")) {
    return "生产支付需要等待支付平台回调确认，请完成扫码支付后稍等几秒并刷新支付状态。";
  }
  if (normalized.includes("amount") && normalized.includes("mismatch")) {
    return "支付金额与订单金额不一致，系统已拦截本次开通。请联系平台管理员核对订单。";
  }
  if (normalized.includes("export task not found")) {
    return "没有找到这个导出任务，可能已过期。请重新创建导出任务。";
  }
  if (normalized.includes("feedback request not found")) {
    return "没有找到这条反馈记录，可能已被处理或删除。请刷新问题反馈列表后重试。";
  }
  if (normalized.includes("notification not found")) {
    return "这条通知已经不存在，请刷新通知列表。";
  }
  if (normalized.includes("no selected date")) {
    return "请先选择一个日期，再打开 AI 助手继续分析。";
  }
  if (normalized.includes("unable to parse") || normalized.includes("empty json") || normalized.includes("ai provider")) {
    return "AI 暂时没有返回可用结果，请稍后重试，或减少输入内容后再试。";
  }
  if (status === 404 || normalized === "not found" || normalized.endsWith(" not found")) {
    return "没有找到对应数据，可能已被更新或删除。请刷新页面后重试。";
  }
  if (status === 400 || normalized === "bad request") {
    return "提交信息不完整或格式不正确，请检查表单内容后重试。";
  }
  if (status && status >= 500) {
    return "服务暂时不可用，请稍后重试；如果反复出现，请联系运维人员。";
  }
  if (normalized === "failed to fetch" || normalized.includes("networkerror")) {
    return "暂时无法连接服务，请确认本地 API 已启动，或稍后重试。";
  }
  return message;
}

async function parseErrorMessage(response: Response) {
  let message = response.statusText;
  try {
    const errorBody = (await response.json()) as { message?: string | string[] };
    message = messageFromBody(errorBody.message, response.statusText);
  } catch {
    message = response.statusText;
  }
  return message;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(humanizeApiError(error instanceof Error ? error.message : "Failed to fetch", undefined, path, options.method ?? "GET"));
  }
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(humanizeApiError(message, response.status, path, options.method ?? "GET"));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export async function apiDownload(path: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    throw new Error(humanizeApiError(error instanceof Error ? error.message : "Failed to fetch", undefined, path, options.method ?? "GET"));
  }
  if (!response.ok) {
    const message = await parseErrorMessage(response);
    throw new Error(humanizeApiError(message, response.status, path, options.method ?? "GET"));
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename="([^"]+)"/);
  return {
    blob: await response.blob(),
    filename: filenameMatch?.[1] ? decodeURIComponent(filenameMatch[1]) : "download.zip"
  };
}
