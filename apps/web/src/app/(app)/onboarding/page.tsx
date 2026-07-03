"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Checkbox, DatePicker, Form, Input, InputNumber, Progress, Select, Space, Tag, Typography, message } from "antd";
import type { CheckboxChangeEvent } from "antd/es/checkbox";
import dayjs, { Dayjs } from "dayjs";
import { ArrowRight, Bot, Building2, CalendarDays, CheckCircle2, ClipboardList, FileText, FolderKanban, Send, Settings2, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { projectIdFromDraftItem } from "@/components/WorkLogDraftComposer";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import {
  completeOnboardingTask,
  defaultOnboardingProgress,
  firstOpenOnboardingTask,
  loadOnboardingProgress,
  onboardingCompletion,
  onboardingFlowForUser,
  onboardingTasksForUser,
  saveOnboardingProgress,
  skipOnboardingTask,
  taskDone,
  type OnboardingProgressState,
  type OnboardingTaskId
} from "@/lib/onboarding";
import type { Department, OrgUser, Project, WorkLog, WorkLogDraft, WorkLogDraftItem, WorkLogKind } from "@/lib/types";

type OrgResponse = {
  departments: Department[];
  users: OrgUser[];
};

type MemberForm = {
  name: string;
  email?: string;
  phone?: string;
  departmentId?: string;
  role: "EMPLOYEE" | "DEPARTMENT_MANAGER" | "COMPANY_ADMIN";
  password: string;
  requiresWorkReport: boolean;
};

type ProjectForm = {
  name: string;
  code?: string;
  description?: string;
  ownerUserId?: string;
  startDate?: Dayjs;
  endDate?: Dayjs;
};

type DraftConfirmItem = WorkLogDraftItem & {
  selected: boolean;
  projectId?: string;
};

type AiDraftMessage = {
  role: "user" | "assistant";
  content: string;
};

const recommendedDepartments = ["总经办", "产品部", "研发部", "市场销售部", "客户成功部", "财务行政部"];
const defaultReportRules = ["工作日 18:00 前提交日报", "次日 10:00 提醒缺填成员", "每周五生成团队周报", "风险和阻塞进入工作日历"];
const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "平台超管",
  COMPANY_ADMIN: "企业管理员",
  DEPARTMENT_MANAGER: "部门经理",
  EMPLOYEE: "员工"
};
const fallbackTask = {
  id: "profile" as const,
  title: "确认我的账号",
  description: "确认当前账号信息后进入工作台。",
  actionLabel: "确认账号"
};

function normalizedDraftItems(draft: WorkLogDraft): WorkLogDraftItem[] {
  return draft.items?.length ? draft.items : [draft];
}

function workLogPayload(item: DraftConfirmItem) {
  const date = dayjs(item.date);
  const safeDate = date.isValid() ? date : dayjs();
  const hours = Number(item.hours);
  const clockToIso = (value?: string | null) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
    if (!match) return undefined;
    return safeDate.hour(Number(match[1])).minute(Number(match[2])).second(0).millisecond(0).toISOString();
  };
  return {
    date: safeDate.format("YYYY-MM-DD"),
    title: item.title || "首条工作日志",
    content: item.content || item.title || "首条工作日志",
    hours: Number.isFinite(hours) && hours > 0 ? hours : null,
    startTime: clockToIso(item.startTime),
    endTime: clockToIso(item.endTime),
    projectId: item.projectId || undefined,
    kind: (item.kind ?? "DAILY") as WorkLogKind
  };
}

function fieldHint(fields: string[]) {
  const labels: Record<string, string> = {
    title: "标题",
    content: "内容",
    hours: "工时",
    date: "日期",
    project: "项目",
    projectId: "项目",
    projectHint: "项目"
  };
  return fields.map((field) => labels[field] ?? field).join("、");
}

function roleText(roles: string[]) {
  return roles.map((role) => roleLabels[role] ?? role).join(" / ");
}

function taskIcon(taskId: OnboardingTaskId) {
  const size = 17;
  if (taskId === "company" || taskId === "profile") return <Building2 size={size} />;
  if (taskId === "departments" || taskId === "members") return <UsersRound size={size} />;
  if (taskId === "rules") return <Settings2 size={size} />;
  if (taskId === "project") return <FolderKanban size={size} />;
  if (taskId === "firstLog") return <ClipboardList size={size} />;
  if (taskId === "departmentReport") return <FileText size={size} />;
  return <CalendarDays size={size} />;
}

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [progress, setProgress] = useState<OnboardingProgressState>(defaultOnboardingProgress);
  const [activeTaskId, setActiveTaskId] = useState<OnboardingTaskId>("company");
  const [departmentTemplate, setDepartmentTemplate] = useState(recommendedDepartments);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [reportRules, setReportRules] = useState(defaultReportRules);
  const [aiInput, setAiInput] = useState("今天完成了客户沟通和项目资料整理，准备明天继续推进需求确认。");
  const [aiMessages, setAiMessages] = useState<AiDraftMessage[]>([
    { role: "assistant", content: "我会帮你把启动任务拆成可确认的工作项。所有日报都先生成草稿，确认后才提交。" }
  ]);
  const [draftItems, setDraftItems] = useState<DraftConfirmItem[]>([]);
  const [memberForm] = Form.useForm<MemberForm>();
  const [projectForm] = Form.useForm<ProjectForm>();

  const org = useQuery({
    queryKey: ["onboarding-org"],
    queryFn: () => apiFetch<OrgResponse>("/org"),
    enabled: Boolean(user)
  });

  const projects = useQuery({
    queryKey: ["onboarding-projects"],
    queryFn: () => apiFetch<Project[]>("/projects"),
    enabled: Boolean(user)
  });

  const flow = onboardingFlowForUser(user);
  const tasks = onboardingTasksForUser(user);
  const completion = onboardingCompletion(user, progress);
  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? firstOpenOnboardingTask(user, progress) ?? fallbackTask;
  const progressPercent = completion.totalCount ? Math.round((completion.doneCount / completion.totalCount) * 100) : 0;
  const isAdminFlow = flow === "admin";
  const projectOptions = useMemo(
    () =>
      (projects.data ?? []).map((project) => ({
        value: project.id,
        label: project.code ? `${project.code} · ${project.name}` : project.name
      })),
    [projects.data]
  );
  const memberOptions = useMemo(
    () =>
      (org.data?.users ?? []).map((member) => ({
        value: member.id,
        label: member.departmentName ? `${member.name} · ${member.departmentName}` : member.name
      })),
    [org.data?.users]
  );
  const selectedDraftCount = draftItems.filter((item) => item.selected).length;
  const selectedDraftHours = draftItems
    .filter((item) => item.selected)
    .reduce((sum, item) => sum + (Number.isFinite(Number(item.hours)) ? Number(item.hours) : 0), 0);

  useEffect(() => {
    if (!user) return;
    const stored = loadOnboardingProgress(user);
    setProgress(stored);
    setActiveTaskId(firstOpenOnboardingTask(user, stored)?.id ?? onboardingTasksForUser(user)[0]?.id ?? "profile");
  }, [user]);

  const persistProgress = (next: OnboardingProgressState) => {
    setProgress(next);
    saveOnboardingProgress(user, next);
  };

  const completeTask = (taskId: OnboardingTaskId) => {
    const next = completeOnboardingTask(progress, taskId);
    persistProgress(next);
    setActiveTaskId(firstOpenOnboardingTask(user, next)?.id ?? taskId);
  };

  const skipTask = (taskId: OnboardingTaskId) => {
    const next = skipOnboardingTask(progress, taskId);
    persistProgress(next);
    setActiveTaskId(firstOpenOnboardingTask(user, next)?.id ?? taskId);
  };

  const createDepartments = useMutation({
    mutationFn: async () => {
      const existing = new Set((org.data?.departments ?? []).map((item) => item.name.trim()));
      const missing = departmentTemplate.map((name) => name.trim()).filter((name) => name.length >= 2 && !existing.has(name));
      for (const name of missing) {
        await apiFetch<Department>("/org/departments", { method: "POST", body: JSON.stringify({ name }) });
      }
      return missing.length;
    },
    onSuccess: async (createdCount) => {
      await queryClient.invalidateQueries({ queryKey: ["onboarding-org"] });
      completeTask("departments");
      message.success(createdCount ? `已创建 ${createdCount} 个推荐部门。` : "推荐部门已存在，已完成确认。");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "部门创建失败")
  });

  const createMember = useMutation({
    mutationFn: (values: MemberForm) =>
      apiFetch<OrgUser>("/org/users", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          email: values.email || undefined,
          phone: values.phone || undefined,
          departmentId: values.departmentId || undefined,
          password: values.password,
          roles: [values.role],
          requiresWorkReport: values.requiresWorkReport
        })
      }),
    onSuccess: async () => {
      memberForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["onboarding-org"] });
      completeTask("members");
      message.success("成员已添加。");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "成员添加失败")
  });

  const createProject = useMutation({
    mutationFn: (values: ProjectForm) =>
      apiFetch<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          code: values.code || undefined,
          description: values.description || undefined,
          ownerUserId: values.ownerUserId || user?.id,
          startDate: values.startDate?.format("YYYY-MM-DD") ?? undefined,
          endDate: values.endDate?.format("YYYY-MM-DD") ?? undefined,
          status: "ACTIVE"
        })
      }),
    onSuccess: async () => {
      projectForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["onboarding-projects"] });
      completeTask("project");
      message.success("第一个项目已创建。");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "项目创建失败")
  });

  const generateDraft = useMutation({
    mutationFn: async () => {
      const text = aiInput.trim();
      if (text.length < 6) throw new Error("请先输入一段真实工作内容。");
      const nextMessages = [...aiMessages, { role: "user" as const, content: text }];
      const draft = await apiFetch<WorkLogDraft>("/ai/work-log-draft", {
        method: "POST",
        body: JSON.stringify({
          currentDate: dayjs().format("YYYY-MM-DD"),
          messages: nextMessages
        })
      });
      return { draft, nextMessages };
    },
    onSuccess: ({ draft, nextMessages }) => {
      const items = normalizedDraftItems(draft).map((item) => ({
        ...item,
        selected: true,
        projectId: projectIdFromDraftItem(projects.data, item)
      }));
      setAiMessages([...nextMessages, { role: "assistant", content: `${draft.assistantMessage} 请确认草稿后再提交。` }]);
      setDraftItems(items);
      message.success(items.length > 1 ? `已生成 ${items.length} 条候选日志。` : "已生成候选日志。");
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "草稿生成失败")
  });

  const submitDrafts = useMutation({
    mutationFn: async () => {
      const selected = draftItems.filter((item) => item.selected);
      if (!selected.length) throw new Error("请至少选择一条日志草稿。");
      for (const item of selected) {
        const workLog = await apiFetch<WorkLog>("/work-logs", { method: "POST", body: JSON.stringify(workLogPayload(item)) });
        await apiFetch<WorkLog>(`/work-logs/${workLog.id}/submit`, { method: "POST" });
      }
      return selected.length;
    },
    onSuccess: (count) => {
      completeTask("firstLog");
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      message.success(`已提交 ${count} 条工作日志。`);
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "日志提交失败")
  });

  const addDepartmentTemplate = () => {
    const value = newDepartmentName.trim();
    if (value.length < 2 || departmentTemplate.includes(value)) return;
    setDepartmentTemplate((items) => [...items, value]);
    setNewDepartmentName("");
  };

  const updateDraftItem = (index: number, patch: Partial<DraftConfirmItem>) => {
    setDraftItems((items) => items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  const removeDraftItem = (index: number) => {
    setDraftItems((items) => items.filter((_, itemIndex) => itemIndex !== index));
  };

  const taskStatusLabel = (taskId: OnboardingTaskId) => {
    if (progress.completed.includes(taskId)) return "已完成";
    if (progress.skipped.includes(taskId)) return "稍后处理";
    return "待处理";
  };

  const renderCompanyCard = () => (
    <div className="onboarding-task-card">
      <div className="onboarding-card-head">
        <div>
          <span>企业空间</span>
          <h2>先确认这里是正确的企业工作台</h2>
        </div>
        <Tag color="processing">{roleText(user?.roles ?? [])}</Tag>
      </div>
      <div className="onboarding-info-grid">
        <div>
          <span>企业名称</span>
          <strong>{user?.tenantName ?? "-"}</strong>
        </div>
        <div>
          <span>企业代码</span>
          <strong>{user?.tenantCode ?? "-"}</strong>
        </div>
        <div>
          <span>管理员</span>
          <strong>{user?.name ?? "-"}</strong>
        </div>
        <div>
          <span>联系方式</span>
          <strong>{user?.email ?? user?.phone ?? "-"}</strong>
        </div>
      </div>
      <div className="onboarding-card-actions">
        <Button type="primary" icon={<CheckCircle2 size={16} />} onClick={() => completeTask("company")}>
          信息正确，继续
        </Button>
      </div>
    </div>
  );

  const renderProfileCard = () => (
    <div className="onboarding-task-card">
      <div className="onboarding-card-head">
        <div>
          <span>我的账号</span>
          <h2>确认我的工作范围</h2>
        </div>
        <Tag color={user?.requiresWorkReport === false ? "default" : "success"}>{user?.requiresWorkReport === false ? "无需日报" : "需要日报"}</Tag>
      </div>
      <div className="onboarding-info-grid">
        <div>
          <span>姓名</span>
          <strong>{user?.name ?? "-"}</strong>
        </div>
        <div>
          <span>部门</span>
          <strong>{user?.departmentName ?? "未设置部门"}</strong>
        </div>
        <div>
          <span>角色</span>
          <strong>{roleText(user?.roles ?? [])}</strong>
        </div>
        <div>
          <span>账号</span>
          <strong>{user?.email ?? user?.phone ?? "-"}</strong>
        </div>
      </div>
      <div className="onboarding-card-actions">
        <Button type="primary" icon={<CheckCircle2 size={16} />} onClick={() => completeTask("profile")}>
          确认范围
        </Button>
      </div>
    </div>
  );

  const renderDepartmentsCard = () => (
    <div className="onboarding-task-card">
      <div className="onboarding-card-head">
        <div>
          <span>推荐模板</span>
          <h2>系统已准备一套中小企业常用部门</h2>
        </div>
        <Tag>{org.data?.departments.length ?? 0} 个已有部门</Tag>
      </div>
      <div className="onboarding-template-list">
        {departmentTemplate.map((name) => (
          <span key={name}>
            {name}
            <button type="button" onClick={() => setDepartmentTemplate((items) => items.filter((item) => item !== name))} aria-label={`移除${name}`}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="onboarding-inline-editor">
        <Input value={newDepartmentName} onChange={(event) => setNewDepartmentName(event.target.value)} placeholder="补充部门名称" onPressEnter={addDepartmentTemplate} />
        <Button onClick={addDepartmentTemplate}>添加</Button>
      </div>
      <div className="onboarding-card-actions">
        <Button type="primary" loading={createDepartments.isPending} onClick={() => createDepartments.mutate()}>
          使用推荐部门
        </Button>
        <Button onClick={() => skipTask("departments")}>稍后调整</Button>
      </div>
    </div>
  );

  const renderMembersCard = () => (
    <div className="onboarding-task-card">
      <div className="onboarding-card-head">
        <div>
          <span>成员</span>
          <h2>先添加一位成员，后续可批量导入</h2>
        </div>
        <Tag>{org.data?.users.length ?? 0} 位当前成员</Tag>
      </div>
      <div className="onboarding-member-options" aria-label="成员添加方式">
        <span>手动添加</span>
        <span>去团队页导入</span>
        <span>先用自己测试</span>
      </div>
      <Form
        form={memberForm}
        layout="vertical"
        initialValues={{ role: "EMPLOYEE", password: "Work123456", requiresWorkReport: true }}
        onFinish={(values) => createMember.mutate(values)}
      >
        <div className="onboarding-form-grid">
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入成员姓名" }, { min: 2, message: "姓名至少 2 个字" }]}>
            <Input placeholder="例如：李明" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="name@company.com" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="departmentId" label="部门">
            <Select
              allowClear
              showSearch
              placeholder="选择部门"
              optionFilterProp="label"
              options={(org.data?.departments ?? []).map((department) => ({ value: department.id, label: department.name }))}
            />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select
              options={[
                { value: "EMPLOYEE", label: "员工" },
                { value: "DEPARTMENT_MANAGER", label: "部门经理" },
                { value: "COMPANY_ADMIN", label: "企业管理员" }
              ]}
            />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: "请输入初始密码" }, { min: 6, message: "至少 6 位" }]}>
            <Input.Password />
          </Form.Item>
        </div>
        <Form.Item name="requiresWorkReport" valuePropName="checked">
          <Checkbox>该成员需要提交日报</Checkbox>
        </Form.Item>
        <div className="onboarding-card-actions">
          <Button type="primary" htmlType="submit" loading={createMember.isPending}>
            添加成员
          </Button>
          <Button onClick={() => router.push("/org")}>去团队页导入</Button>
          <Button
            onClick={() => {
              completeTask("members");
              message.success("已选择先用管理员账号测试。");
            }}
          >
            先用自己测试
          </Button>
          <Button onClick={() => skipTask("members")}>稍后添加</Button>
        </div>
      </Form>
    </div>
  );

  const renderRulesCard = () => (
    <div className="onboarding-task-card">
      <div className="onboarding-card-head">
        <div>
          <span>填报规则</span>
          <h2>先使用推荐规则，让团队明天就能跑起来</h2>
        </div>
        <Tag color="success">推荐</Tag>
      </div>
      <div className="onboarding-rule-list">
        {reportRules.map((rule, index) => (
          <label key={rule}>
            <Checkbox
              checked
              onChange={(event: CheckboxChangeEvent) => {
                if (!event.target.checked) setReportRules((items) => items.filter((_, itemIndex) => itemIndex !== index));
              }}
            />
            <span>{rule}</span>
          </label>
        ))}
      </div>
      <Alert type="info" showIcon message="当前版本先保存为启动助手进度。后续可在团队设置中统一管理规则。" />
      <div className="onboarding-card-actions">
        <Button type="primary" onClick={() => completeTask("rules")}>
          使用推荐设置
        </Button>
      </div>
    </div>
  );

  const renderProjectCard = () => (
    <div className="onboarding-task-card">
      <div className="onboarding-card-head">
        <div>
          <span>项目</span>
          <h2>创建第一个项目，用来承接日报进展</h2>
        </div>
        <Tag>{projects.data?.length ?? 0} 个当前项目</Tag>
      </div>
      <Form form={projectForm} layout="vertical" onFinish={(values) => createProject.mutate(values)} initialValues={{ ownerUserId: user?.id }}>
        <div className="onboarding-form-grid">
          <Form.Item name="name" label="项目名称" rules={[{ required: true, message: "请输入项目名称" }, { min: 2, message: "项目名称至少 2 个字" }]}>
            <Input placeholder="例如：客户增长计划" />
          </Form.Item>
          <Form.Item name="code" label="项目编号">
            <Input placeholder="例如：P2026-001" />
          </Form.Item>
          <Form.Item name="ownerUserId" label="负责人">
            <Select showSearch optionFilterProp="label" options={memberOptions} />
          </Form.Item>
          <Form.Item name="startDate" label="开始日期">
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item name="endDate" label="结束日期">
            <DatePicker className="w-full" />
          </Form.Item>
        </div>
        <Form.Item name="description" label="项目说明">
          <Input.TextArea rows={3} placeholder="可选：项目目标、客户、当前阶段" />
        </Form.Item>
        <div className="onboarding-card-actions">
          <Button type="primary" htmlType="submit" loading={createProject.isPending}>
            创建项目
          </Button>
          <Button onClick={() => skipTask("project")}>稍后创建</Button>
        </div>
      </Form>
    </div>
  );

  const renderFirstLogCard = () => (
    <div className="onboarding-task-card">
      <div className="onboarding-card-head">
        <div>
          <span>首条日志</span>
          <h2>用一句话生成草稿，确认后再提交</h2>
        </div>
        <Tag color="processing">不会自动提交</Tag>
      </div>
      <div className="onboarding-ai-input">
        <Input.TextArea
          value={aiInput}
          onChange={(event) => setAiInput(event.target.value)}
          rows={4}
          maxLength={1200}
          showCount
          placeholder="例如：上午跟客户确认需求，下午整理项目计划并同步给研发。"
        />
        <Button type="primary" icon={<Bot size={16} />} loading={generateDraft.isPending} onClick={() => generateDraft.mutate()}>
          生成草稿
        </Button>
      </div>
      {draftItems.length ? (
        <div className="onboarding-draft-stack">
          <div className="onboarding-draft-summary">
            <strong>识别到 {draftItems.length} 条候选日志</strong>
            <span>已选 {selectedDraftCount} 条 · 合计 {selectedDraftHours.toFixed(1)}h</span>
          </div>
          {draftItems.map((item, index) => (
            <article className="onboarding-draft-item" key={`${item.date}-${item.title}-${index}`}>
              <Checkbox checked={item.selected} onChange={(event) => updateDraftItem(index, { selected: event.target.checked })} />
              <div className="onboarding-draft-fields">
                <div className="onboarding-draft-title-row">
                  <Input value={item.title} onChange={(event) => updateDraftItem(index, { title: event.target.value })} placeholder="标题" />
                  <Tag color={item.kind === "PLAN" ? "blue" : "green"}>{item.kind === "PLAN" ? "计划" : "日报"}</Tag>
                </div>
                <Input.TextArea value={item.content} rows={3} onChange={(event) => updateDraftItem(index, { content: event.target.value })} placeholder="工作内容" />
                <div className="onboarding-draft-grid">
                  <DatePicker value={dayjs(item.date)} onChange={(value) => updateDraftItem(index, { date: value?.format("YYYY-MM-DD") ?? dayjs().format("YYYY-MM-DD") })} />
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={item.projectId}
                    placeholder={item.projectHint ? `待确认：${item.projectHint}` : "选择项目，可留空"}
                    options={projectOptions}
                    onChange={(value) => updateDraftItem(index, { projectId: value })}
                  />
                  <InputNumber min={0.5} max={24} step={0.5} value={Number(item.hours) || undefined} addonAfter="h" onChange={(value) => updateDraftItem(index, { hours: Number(value) || 0 })} />
                </div>
                {item.missingFields?.length ? <div className="onboarding-field-hint">需确认：{fieldHint(item.missingFields)}</div> : null}
              </div>
              <Button type="text" danger onClick={() => removeDraftItem(index)}>
                删除
              </Button>
            </article>
          ))}
          <div className="onboarding-submit-bar">
            <span>共 {selectedDraftCount} 条日志，合计 {selectedDraftHours.toFixed(1)}h</span>
            <Button type="primary" loading={submitDrafts.isPending} disabled={!selectedDraftCount} onClick={() => submitDrafts.mutate()}>
              提交 {selectedDraftCount} 条日志
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderNavigationCard = () => {
    if (activeTask.id === "departmentCalendar") {
      return (
        <div className="onboarding-task-card">
          <div className="onboarding-card-head">
            <div>
              <span>部门日历</span>
              <h2>下一步去看团队填报状态</h2>
            </div>
          </div>
          <p className="onboarding-card-copy">工作日历会展示缺填、填报率、风险/阻塞和下一步动作。部门经理默认只能看到授权范围。</p>
          <div className="onboarding-card-actions">
            <Button type="primary" icon={<CalendarDays size={16} />} onClick={() => completeTask("departmentCalendar")}>
              标记完成
            </Button>
            <Button onClick={() => router.push("/calendar")}>打开工作日历</Button>
          </div>
        </div>
      );
    }
    if (activeTask.id === "departmentReport") {
      return (
        <div className="onboarding-task-card">
          <div className="onboarding-card-head">
            <div>
              <span>周期汇报</span>
              <h2>基于日报生成部门汇报</h2>
            </div>
          </div>
          <p className="onboarding-card-copy">有真实日报后，汇报页会显示数据准备度，并推荐今日/本周汇报。</p>
          <div className="onboarding-card-actions">
            <Button type="primary" icon={<FileText size={16} />} onClick={() => completeTask("departmentReport")}>
              标记完成
            </Button>
            <Button onClick={() => router.push("/reports")}>打开汇报页</Button>
          </div>
        </div>
      );
    }
    return (
      <div className="onboarding-task-card">
        <div className="onboarding-card-head">
          <div>
            <span>填报记录</span>
            <h2>查看我的日报和草稿</h2>
          </div>
        </div>
        <p className="onboarding-card-copy">提交后可以在填报记录里继续查看详情、编辑草稿和下载附件。</p>
        <div className="onboarding-card-actions">
          <Button type="primary" icon={<ClipboardList size={16} />} onClick={() => completeTask("records")}>
            标记完成
          </Button>
          <Button onClick={() => router.push("/work-logs")}>打开填报记录</Button>
        </div>
      </div>
    );
  };

  const renderActiveTask = () => {
    if (activeTask.id === "company") return renderCompanyCard();
    if (activeTask.id === "profile") return renderProfileCard();
    if (activeTask.id === "departments") return renderDepartmentsCard();
    if (activeTask.id === "members") return renderMembersCard();
    if (activeTask.id === "rules") return renderRulesCard();
    if (activeTask.id === "project") return renderProjectCard();
    if (activeTask.id === "firstLog") return renderFirstLogCard();
    return renderNavigationCard();
  };

  return (
    <div className="page-stack onboarding-page">
      <div className="page-header onboarding-header">
        <div>
          <Typography.Title level={3} className="page-title">
            AI 启动助手
          </Typography.Title>
          <Typography.Text className="page-subtitle">
            {isAdminFlow ? "我会帮你把企业空间配置到可用状态，先自动完成大部分基础工作。" : "先完成你的首条工作日志，再进入日常工作台。"}
          </Typography.Text>
        </div>
        <Space wrap>
          <Button onClick={() => router.push("/calendar")}>进入工作日历</Button>
          {completion.isComplete ? (
            <Button type="primary" icon={<ArrowRight size={16} />} onClick={() => router.push("/calendar")}>
              开始使用
            </Button>
          ) : null}
        </Space>
      </div>

      <div className="onboarding-layout">
        <main className="onboarding-main">
          <section className="onboarding-assistant-panel">
            <div className="onboarding-assistant-head">
              <span className="onboarding-assistant-icon">
                <Bot size={18} />
              </span>
              <div>
                <strong>{flow === "admin" ? "企业管理员启动流程" : flow === "manager" ? "部门经理启动流程" : "员工启动流程"}</strong>
                <p>当前任务：{activeTask.title}</p>
              </div>
            </div>
            <div className="onboarding-chat-list">
              {aiMessages.slice(-3).map((item, index) => (
                <div className={`onboarding-chat-message is-${item.role}`} key={`${item.role}-${index}`}>
                  {item.content}
                </div>
              ))}
            </div>
          </section>

          {renderActiveTask()}
        </main>

        <aside className="onboarding-checklist">
          <div className="onboarding-progress-head">
            <div>
              <span>启动进度</span>
              <strong>
                {completion.doneCount}/{completion.totalCount}
              </strong>
            </div>
            <Progress type="circle" percent={progressPercent} size={58} strokeColor="var(--color-ai)" />
          </div>
          <div className="onboarding-task-list">
            {tasks.map((task) => {
              const done = taskDone(progress, task.id);
              const active = task.id === activeTask.id;
              return (
                <button key={task.id} type="button" className={`onboarding-task-button${active ? " is-active" : ""}${done ? " is-done" : ""}`} onClick={() => setActiveTaskId(task.id)}>
                  <span>{done ? <CheckCircle2 size={17} /> : taskIcon(task.id)}</span>
                  <div>
                    <strong>{task.title}</strong>
                    <em>{taskStatusLabel(task.id)}</em>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="onboarding-next-panel">
            <strong>{completion.isComplete ? "启动完成" : "建议下一步"}</strong>
            <p>{completion.isComplete ? "现在可以进入工作日历，开始日常填报和管理。" : activeTask.description}</p>
            {!completion.isComplete && activeTask.id !== "firstLog" ? (
              <Button block onClick={() => skipTask(activeTask.id)}>
                这一步稍后处理
              </Button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
