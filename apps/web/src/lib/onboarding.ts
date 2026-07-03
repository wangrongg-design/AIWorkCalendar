"use client";

import type { AuthUser } from "./types";

export type OnboardingTaskId =
  | "company"
  | "departments"
  | "members"
  | "rules"
  | "project"
  | "firstLog"
  | "profile"
  | "departmentCalendar"
  | "departmentReport"
  | "records";

export type OnboardingRoleFlow = "admin" | "manager" | "employee";

export type OnboardingTaskDefinition = {
  id: OnboardingTaskId;
  title: string;
  description: string;
  actionLabel: string;
};

export type OnboardingProgressState = {
  completed: OnboardingTaskId[];
  skipped: OnboardingTaskId[];
  dismissed: boolean;
  updatedAt: string;
};

const adminTasks: OnboardingTaskDefinition[] = [
  { id: "company", title: "确认企业信息", description: "确认企业空间、管理员和基础身份信息。", actionLabel: "确认信息" },
  { id: "departments", title: "创建部门结构", description: "使用推荐模板快速建立部门，后续可继续调整。", actionLabel: "使用推荐部门" },
  { id: "members", title: "添加成员", description: "先添加核心成员或自己测试账号，系统会进入真实协作状态。", actionLabel: "添加成员" },
  { id: "rules", title: "设置填报规则", description: "确认日报时间、提醒和周报周期。", actionLabel: "使用推荐设置" },
  { id: "project", title: "创建第一个项目", description: "让日报可以沉淀到项目进展、风险和汇报中。", actionLabel: "创建项目" },
  { id: "firstLog", title: "提交首条工作日志", description: "用自然语言生成草稿，确认后进入工作日历。", actionLabel: "生成草稿" }
];

const managerTasks: OnboardingTaskDefinition[] = [
  { id: "profile", title: "确认我的工作范围", description: "确认当前部门和日报要求，之后只看权限范围内的数据。", actionLabel: "确认范围" },
  { id: "firstLog", title: "提交首条工作日志", description: "先用一条真实记录体验项目、日历和汇报如何联动。", actionLabel: "生成草稿" },
  { id: "departmentCalendar", title: "查看部门日历", description: "打开工作日历，查看团队填报率、缺填和风险/阻塞。", actionLabel: "查看日历" },
  { id: "departmentReport", title: "生成部门汇报", description: "进入汇报页，基于真实日报整理部门周期汇报。", actionLabel: "查看汇报" }
];

const employeeTasks: OnboardingTaskDefinition[] = [
  { id: "profile", title: "确认我的账号", description: "确认姓名、部门和是否需要日报。", actionLabel: "确认账号" },
  { id: "firstLog", title: "提交首条工作日志", description: "像聊天一样描述今天做了什么，再确认草稿。", actionLabel: "生成草稿" },
  { id: "records", title: "查看填报记录", description: "查看自己的草稿、已提交记录和 AI 结构化结果。", actionLabel: "查看记录" }
];

export const defaultOnboardingProgress: OnboardingProgressState = {
  completed: [],
  skipped: [],
  dismissed: false,
  updatedAt: ""
};

export function onboardingFlowForUser(user: AuthUser | null): OnboardingRoleFlow {
  if (user?.roles.includes("COMPANY_ADMIN") || user?.roles.includes("SUPER_ADMIN")) return "admin";
  if (user?.roles.includes("DEPARTMENT_MANAGER")) return "manager";
  return "employee";
}

export function onboardingTasksForUser(user: AuthUser | null): OnboardingTaskDefinition[] {
  const flow = onboardingFlowForUser(user);
  if (flow === "admin") return adminTasks;
  if (flow === "manager") return managerTasks;
  return employeeTasks;
}

export function onboardingStorageKey(user: AuthUser | null) {
  if (!user) return "work-calendar-ai-onboarding-anonymous";
  return `work-calendar-ai-onboarding-${user.tenantId}-${user.id}`;
}

function uniqueTaskIds(values: unknown): OnboardingTaskId[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter((value): value is OnboardingTaskId => typeof value === "string")));
}

export function loadOnboardingProgress(user: AuthUser | null): OnboardingProgressState {
  if (typeof window === "undefined" || !user) return defaultOnboardingProgress;
  try {
    const raw = window.localStorage.getItem(onboardingStorageKey(user));
    if (!raw) return defaultOnboardingProgress;
    const parsed = JSON.parse(raw) as Partial<OnboardingProgressState>;
    return {
      completed: uniqueTaskIds(parsed.completed),
      skipped: uniqueTaskIds(parsed.skipped),
      dismissed: Boolean(parsed.dismissed),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : ""
    };
  } catch {
    return defaultOnboardingProgress;
  }
}

export function saveOnboardingProgress(user: AuthUser | null, state: OnboardingProgressState) {
  if (typeof window === "undefined" || !user) return;
  window.localStorage.setItem(
    onboardingStorageKey(user),
    JSON.stringify({
      ...state,
      completed: uniqueTaskIds(state.completed),
      skipped: uniqueTaskIds(state.skipped),
      updatedAt: new Date().toISOString()
    })
  );
  window.dispatchEvent(new CustomEvent("work-calendar-ai-onboarding-updated"));
}

export function taskDone(state: OnboardingProgressState, taskId: OnboardingTaskId) {
  return state.completed.includes(taskId) || state.skipped.includes(taskId);
}

export function completeOnboardingTask(state: OnboardingProgressState, taskId: OnboardingTaskId): OnboardingProgressState {
  return {
    ...state,
    completed: uniqueTaskIds([...state.completed, taskId]),
    skipped: state.skipped.filter((item) => item !== taskId),
    updatedAt: new Date().toISOString()
  };
}

export function skipOnboardingTask(state: OnboardingProgressState, taskId: OnboardingTaskId): OnboardingProgressState {
  if (state.completed.includes(taskId)) return state;
  return {
    ...state,
    skipped: uniqueTaskIds([...state.skipped, taskId]),
    updatedAt: new Date().toISOString()
  };
}

export function dismissOnboarding(state: OnboardingProgressState): OnboardingProgressState {
  return {
    ...state,
    dismissed: true,
    updatedAt: new Date().toISOString()
  };
}

export function onboardingCompletion(user: AuthUser | null, state: OnboardingProgressState) {
  const tasks = onboardingTasksForUser(user);
  const doneCount = tasks.filter((task) => taskDone(state, task.id)).length;
  return {
    tasks,
    doneCount,
    totalCount: tasks.length,
    isComplete: doneCount >= tasks.length
  };
}

export function firstOpenOnboardingTask(user: AuthUser | null, state: OnboardingProgressState) {
  return onboardingTasksForUser(user).find((task) => !taskDone(state, task.id)) ?? onboardingTasksForUser(user)[0];
}
