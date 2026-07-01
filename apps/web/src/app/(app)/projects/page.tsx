"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DatePicker, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { AlertTriangle, Bot, Edit2, FolderKanban, MessageSquare, Plus, Send, Trash2 } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { WorkLogDetailTitle, WorkLogDetailView } from "@/components/WorkLogDetailView";
import { apiFetch } from "@/lib/api";
import { hasAnyRole, useAuthStore } from "@/lib/auth-store";
import { CommunicationInsight, CommunicationSource, OrgUser, Project, ProjectStatus, WorkLog } from "@/lib/types";

type OrgResponse = {
  users: OrgUser[];
};

type ProjectForm = {
  code?: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  ownerUserId?: string;
  startDate?: Dayjs;
  endDate?: Dayjs;
};

type ProjectWorkLogForm = {
  date: Dayjs;
  title: string;
  content: string;
  hours?: number | null;
  projectId?: string | null;
};

type ProjectChatSource = {
  id: string;
  date: string;
  title: string;
  userName: string;
  departmentName?: string | null;
  hours: number;
  evidence: string;
  riskCount: number;
  blockerCount: number;
};

type ProjectChatResponse = {
  answer: string;
  contextCount: number;
  period: {
    start: string;
    end: string;
  };
  project: {
    id: string;
    name: string;
    code?: string | null;
    ownerName?: string | null;
  };
  sources: ProjectChatSource[];
};

type ProjectChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ProjectChatSource[];
  contextCount?: number;
};

const statusOptions: Array<{ value: ProjectStatus; label: string; color: string }> = [
  { value: "ACTIVE", label: "进行中", color: "green" },
  { value: "PAUSED", label: "暂停", color: "orange" },
  { value: "ARCHIVED", label: "已归档", color: "default" }
];

function statusLabel(status: ProjectStatus) {
  return statusOptions.find((item) => item.value === status)?.label ?? status;
}

function statusColor(status: ProjectStatus) {
  return statusOptions.find((item) => item.value === status)?.color ?? "default";
}

function dateText(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD") : "未设置";
}

function formatHours(value: string | number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}h`;
}

function projectHealth(project: Project) {
  if (project.status === "ARCHIVED") return { label: "已归档", color: "default" };
  if (project.status === "PAUSED") return { label: "暂停观察", color: "orange" };
  if (project.endDate) {
    const daysLeft = dayjs(project.endDate).startOf("day").diff(dayjs().startOf("day"), "day");
    if (daysLeft < 0) return { label: "已逾期", color: "red" };
    if (daysLeft <= 7) return { label: `${daysLeft} 天到期`, color: "gold" };
  }
  return { label: "健康", color: "green" };
}

function toPayload(values: ProjectForm) {
  return {
    code: values.code?.trim() || null,
    name: values.name.trim(),
    description: values.description?.trim() || null,
    status: values.status,
    ownerUserId: values.ownerUserId || null,
    startDate: values.startDate?.format("YYYY-MM-DD") ?? null,
    endDate: values.endDate?.format("YYYY-MM-DD") ?? null
  };
}

function workLogPayload(values: ProjectWorkLogForm) {
  return {
    date: values.date.format("YYYY-MM-DD"),
    title: values.title,
    content: values.content,
    hours: typeof values.hours === "number" && Number.isFinite(values.hours) ? values.hours : null,
    projectId: values.projectId || null
  };
}

function uniqueTexts(values: Array<string | null | undefined>, limit = 8) {
  return Array.from(new Set(values.map((item) => item?.trim()).filter(Boolean) as string[])).slice(0, limit);
}

function logRiskBlockerCount(record: WorkLog) {
  return (record.aiAnalysis?.risks?.length ?? 0) + (record.aiAnalysis?.blockers?.length ?? 0);
}

function buildProjectLogQuery(projectId: string, range: [Dayjs, Dayjs] | null) {
  const params = new URLSearchParams({ projectId });
  if (range) {
    params.set("from", range[0].format("YYYY-MM-DD"));
    params.set("to", range[1].format("YYYY-MM-DD"));
  }
  return `/work-logs?${params.toString()}`;
}

function rangeText(range: [Dayjs, Dayjs] | null) {
  if (!range) return "全部时间";
  return `${range[0].format("YYYY-MM-DD")} 至 ${range[1].format("YYYY-MM-DD")}`;
}

function projectChatPayload(projectId: string, question: string, range: [Dayjs, Dayjs] | null) {
  return {
    projectId,
    question,
    startDate: range?.[0].format("YYYY-MM-DD"),
    endDate: range?.[1].format("YYYY-MM-DD")
  };
}

function projectQuestionPrompt(label: string) {
  if (label === "总结近期进展") return "请总结这个项目近期进展，按已完成、正在推进、需要跟进输出，并列出依据日报。";
  if (label === "查看风险/阻塞") return "这个项目当前最大的风险或阻塞是什么？请给出结论、依据日报和建议动作。";
  if (label === "生成项目周报") return "请基于当前项目日报生成一份项目周报，包含关键进展、风险/阻塞、下周动作和来源。";
  if (label === "整理下一步动作") return "请从这个项目最近日报中提取下一步待办，按负责人或事项整理，并说明依据。";
  return label;
}

function renderMarkdownInline(text: string) {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(<strong key={`${match.index}-${match[1]}`}>{match[1]}</strong>);
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes.length ? nodes : text;
}

function renderAssistantMarkdown(content: string) {
  const nodes: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: ReactNode[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const ListTag = list.type;
    nodes.push(
      <ListTag key={`list-${nodes.length}`} className="ai-copilot-markdown-list">
        {list.items}
      </ListTag>
    );
    list = null;
  };

  content.replace(/\r\n/g, "\n").split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushList();
      nodes.push(
        <strong key={`heading-${index}`} className="ai-copilot-markdown-heading">
          {renderMarkdownInline(heading[2])}
        </strong>
      );
      return;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (unordered || ordered) {
      const type = unordered ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(<li key={`item-${index}`}>{renderMarkdownInline((unordered ?? ordered)?.[1] ?? trimmed)}</li>);
      return;
    }
    flushList();
    nodes.push(<p key={`paragraph-${index}`}>{renderMarkdownInline(trimmed)}</p>);
  });
  flushList();
  return nodes;
}

function projectOverviewText(project: Project, analysis: ReturnType<typeof summarizeProjectLogs>) {
  if (!analysis.totalLogs) {
    return `${project.name} 当前周期还没有关联日报。`;
  }
  if (analysis.riskBlockerCount) {
    return `${project.name} 当前周期有 ${analysis.totalLogs} 条日报/计划，存在 ${analysis.riskBlockerCount} 条风险/阻塞记录。`;
  }
  return `${project.name} 当前周期有 ${analysis.totalLogs} 条日报/计划，整体${projectHealth(project).label}，暂无明确风险/阻塞。`;
}

function projectNextActions(project: Project, analysis: ReturnType<typeof summarizeProjectLogs>) {
  const actions: string[] = [];
  if (!project.owner?.name) {
    actions.push("先补充项目负责人，避免风险归属不清。");
  }
  if (analysis.riskBlockerCount) {
    actions.push(`请 ${project.owner?.name ?? "项目负责人"} 核对风险/阻塞日报，确认影响范围和处理动作。`);
  }
  if (project.endDate) {
    const daysLeft = dayjs(project.endDate).startOf("day").diff(dayjs().startOf("day"), "day");
    if (daysLeft < 0) {
      actions.push("项目已超过结束日期，建议复核交付状态或调整项目周期。");
    } else if (daysLeft <= 7) {
      actions.push(`距离结束日期还有 ${daysLeft} 天，建议确认剩余任务和延期风险。`);
    }
  }
  if (!analysis.totalLogs) {
    actions.push("当前周期缺少关联日报，先提醒成员按项目归属提交记录。");
  }
  if (!actions.length) {
    actions.push("继续保持日报归属，周会前复核关键进展即可。");
  }
  return actions.slice(0, 3);
}

function summarizeProjectLogs(logs: WorkLog[]) {
  const totalHours = logs.reduce((sum, item) => sum + Number(item.hours ?? 0), 0);
  const riskCount = logs.reduce((sum, item) => sum + (item.aiAnalysis?.risks?.length ?? 0), 0);
  const blockerCount = logs.reduce((sum, item) => sum + (item.aiAnalysis?.blockers?.length ?? 0), 0);
  const members = uniqueTexts(logs.map((item) => item.user?.name));
  const completed = uniqueTexts(logs.flatMap((item) => item.aiAnalysis?.achievements?.length ? item.aiAnalysis.achievements : [item.title]), 6);
  const risks = uniqueTexts(logs.flatMap((item) => [...(item.aiAnalysis?.risks ?? []), ...(item.aiAnalysis?.blockers ?? [])]), 6);
  const latestLog = logs[0] ?? null;
  return {
    totalLogs: logs.length,
    totalHours,
    riskCount,
    blockerCount,
    riskBlockerCount: riskCount + blockerCount,
    members,
    completed,
    risks,
    latestDate: latestLog?.date ?? null
  };
}

export default function ProjectsPage() {
  const user = useAuthStore((state) => state.user);
  const canManage = hasAnyRole(user, ["SUPER_ADMIN", "COMPANY_ADMIN"]);
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProjectForm>();
  const [workLogForm] = Form.useForm<ProjectWorkLogForm>();
  const projectChatThreadRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Project | null>(null);
  const [detailLog, setDetailLog] = useState<WorkLog | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ACTIVE");
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>([dayjs().subtract(14, "day"), dayjs().add(7, "day")]);
  const [projectChatInput, setProjectChatInput] = useState("");
  const [projectChatMessages, setProjectChatMessages] = useState<ProjectChatMessage[]>([]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/projects")
  });

  const org = useQuery({
    queryKey: ["org"],
    queryFn: () => apiFetch<OrgResponse>("/org"),
    enabled: canManage
  });

  const userOptions = useMemo(
    () => org.data?.users.map((item) => ({ value: item.id, label: `${item.name} · ${item.departmentName ?? "未分配部门"}` })) ?? [],
    [org.data?.users]
  );

  const filteredProjects = useMemo(() => {
    return (projects.data ?? []).filter((item) => (statusFilter === "ALL" ? true : item.status === statusFilter));
  }, [projects.data, statusFilter]);

  const selectedProject = useMemo(() => {
    return filteredProjects.find((item) => item.id === selectedProjectId) ?? filteredProjects[0] ?? null;
  }, [filteredProjects, selectedProjectId]);

  const projectLogs = useQuery({
    queryKey: [
      "project-work-logs",
      selectedProject?.id,
      range?.[0].format("YYYY-MM-DD") ?? "all",
      range?.[1].format("YYYY-MM-DD") ?? "all"
    ],
    queryFn: () => apiFetch<WorkLog[]>(buildProjectLogQuery(selectedProject!.id, range)),
    enabled: Boolean(selectedProject?.id)
  });

  const communicationSources = useQuery({
    queryKey: ["wecom-sources"],
    queryFn: () => apiFetch<CommunicationSource[]>("/wecom/sources")
  });

  const communicationDrafts = useQuery({
    queryKey: ["wecom-log-drafts"],
    queryFn: () => apiFetch<CommunicationInsight[]>("/wecom/log-drafts")
  });

  const projectAnalysis = useMemo(() => {
    return summarizeProjectLogs(projectLogs.data ?? []);
  }, [projectLogs.data]);
  const projectLogById = useMemo(() => new Map((projectLogs.data ?? []).map((item) => [item.id, item])), [projectLogs.data]);
  const projectQuickQuestions = useMemo(
    () =>
      selectedProject
        ? [
            "总结近期进展",
            "查看风险/阻塞",
            "生成项目周报",
            "整理下一步动作"
          ]
        : [],
    [selectedProject]
  );
  const projectActions = useMemo(() => (selectedProject ? projectNextActions(selectedProject, projectAnalysis) : []), [projectAnalysis, selectedProject]);
  const selectedProjectSources = useMemo(
    () => (selectedProject ? (communicationSources.data ?? []).filter((item) => item.projectIds.includes(selectedProject.id)) : []),
    [communicationSources.data, selectedProject]
  );
  const selectedProjectDrafts = useMemo(
    () =>
      selectedProject
        ? (communicationDrafts.data ?? []).filter(
            (item) => item.projectId === selectedProject.id || item.projectHints?.some((hint) => hint.includes(selectedProject.name) || (selectedProject.code && hint.includes(selectedProject.code)))
          )
        : [],
    [communicationDrafts.data, selectedProject]
  );

  const saveProject = useMutation({
    mutationFn: (values: ProjectForm) => {
      if (editing) {
        return apiFetch<Project>(`/projects/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(toPayload(values))
        });
      }
      return apiFetch<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(toPayload(values))
      });
    },
    onSuccess: (project) => {
      message.success("项目已保存");
      setSelectedProjectId(project.id);
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      message.success("项目已归档");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  const canEditWorkLog = (record: WorkLog) => {
    return Boolean(record.userId === user?.id || canManage);
  };

  const updateProjectWorkLog = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ProjectWorkLogForm }) =>
      apiFetch<WorkLog>(`/work-logs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(workLogPayload(values))
      }),
    onSuccess: (updated) => {
      message.success("日报已更新");
      setDetailLog(updated);
      setDetailEditing(false);
      queryClient.invalidateQueries({ queryKey: ["project-work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "更新日报失败");
    }
  });

  const deleteProjectWorkLog = useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/work-logs/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      message.success("日报已删除");
      setDetailLog((current) => (current?.id === id ? null : current));
      setDetailEditing(false);
      queryClient.invalidateQueries({ queryKey: ["project-work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["work-logs"] });
      queryClient.invalidateQueries({ queryKey: ["calendar"] });
      queryClient.invalidateQueries({ queryKey: ["calendar-today"] });
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "删除日报失败");
    }
  });

  const projectChat = useMutation({
    mutationFn: ({ projectId, question }: { projectId: string; question: string }) =>
      apiFetch<ProjectChatResponse>("/ai/chat/project", {
        method: "POST",
        body: JSON.stringify(projectChatPayload(projectId, question, range))
      }),
    onSuccess: (data) => {
      setProjectChatMessages((items) => [
        ...items,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          sources: data.sources,
          contextCount: data.contextCount
        }
      ]);
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : "项目助手暂时无法回答，请稍后重试");
    }
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: "ACTIVE" });
    setModalOpen(true);
  };

  const openEdit = (record: Project) => {
    setEditing(record);
    form.setFieldsValue({
      code: record.code ?? undefined,
      name: record.name,
      description: record.description ?? undefined,
      status: record.status,
      ownerUserId: record.ownerUserId ?? undefined,
      startDate: record.startDate ? dayjs(record.startDate) : undefined,
      endDate: record.endDate ? dayjs(record.endDate) : undefined
    });
    setModalOpen(true);
  };

  const openLogDetail = (record: WorkLog) => {
    setDetailLog(record);
    setDetailEditing(false);
  };

  const askProjectQuestion = (question = projectChatInput) => {
    const normalized = question.trim();
    if (!normalized || !selectedProject || projectChat.isPending) return;
    setProjectChatMessages((items) => [
      ...items,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: normalized
      }
    ]);
    setProjectChatInput("");
    projectChat.mutate({ projectId: selectedProject.id, question: normalized });
  };

  useEffect(() => {
    if (!detailEditing || !detailLog) return;
    workLogForm.setFieldsValue({
      date: dayjs(detailLog.date),
      title: detailLog.title,
      content: detailLog.content,
      hours: Number(detailLog.hours),
      projectId: detailLog.projectId ?? selectedProject?.id ?? undefined
    });
  }, [detailEditing, detailLog, selectedProject?.id, workLogForm]);

  useEffect(() => {
    setProjectChatMessages([]);
    setProjectChatInput("");
  }, [selectedProject?.id, range?.[0]?.format("YYYY-MM-DD"), range?.[1]?.format("YYYY-MM-DD")]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const thread = projectChatThreadRef.current;
      if (!thread) return;
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      thread.scrollTo({ top: thread.scrollHeight, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [projectChatMessages, projectChat.isPending]);

  const logColumns: ColumnsType<WorkLog> = [
    { title: "日期", dataIndex: "date", width: 112, render: (value: string) => dayjs(value).format("MM-DD") },
    {
      title: "日报内容",
      render: (_, record) => (
        <div className="min-w-0">
          <Button type="link" className="!h-auto !p-0 !text-left font-medium" onClick={() => openLogDetail(record)}>
            {record.title}
          </Button>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{record.aiAnalysis?.summary ?? record.content}</div>
          {record.sourceLinks?.length ? <Tag className="mt-2" color="cyan">沟通来源 {record.sourceLinks.length}</Tag> : null}
        </div>
      )
    },
    { title: "人员", width: 110, render: (_, record) => record.user?.name ?? "-" },
    { title: "工时", dataIndex: "hours", width: 90, render: formatHours },
    {
      title: "风险/阻塞",
      width: 120,
      render: (_, record) => {
        const count = logRiskBlockerCount(record);
        return <Tag color={count ? "red" : "default"}>{count ? `${count} 条` : "无"}</Tag>;
      }
    }
  ];

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            项目中心
          </Typography.Title>
          <Typography.Text className="page-subtitle">项目日报沉淀为进展、风险/阻塞和下一步动作。</Typography.Text>
        </div>
        {canManage ? (
          <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
            新增项目
          </Button>
        ) : null}
      </div>

      <div className="toolbar-panel project-analysis-toolbar">
        <Space wrap>
          <Select
            value={statusFilter}
            style={{ width: 132 }}
            onChange={(value) => {
              setStatusFilter(value);
              setSelectedProjectId(undefined);
            }}
            options={[{ value: "ACTIVE", label: "进行中" }, { value: "ALL", label: "全部项目" }, ...statusOptions.filter((item) => item.value !== "ACTIVE").map((item) => ({ value: item.value, label: item.label }))]}
          />
          <DatePicker.RangePicker
            value={range}
            onChange={(dates) => setRange(dates?.[0] && dates?.[1] ? [dates[0], dates[1]] : null)}
            allowClear
          />
        </Space>
      </div>

      <div className="project-analysis-layout">
        <section className="surface-panel project-list-panel">
          <div className="section-head">
            <div>
              <div className="section-title">项目列表</div>
            </div>
          </div>
          <div className="project-list">
            {filteredProjects.length ? (
              filteredProjects.map((project) => {
                const health = projectHealth(project);
                const active = project.id === selectedProject?.id;
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`project-list-item ${active ? "is-active" : ""}`}
                    onClick={() => setSelectedProjectId(project.id)}
                  >
                    <span className="project-list-title">
                      <strong>{project.name}</strong>
                      {project.code ? <Tag>{project.code}</Tag> : null}
                    </span>
                    <span className="project-list-meta">
                      <Tag color={statusColor(project.status)}>{statusLabel(project.status)}</Tag>
                      <Tag color={health.color}>{health.label}</Tag>
                    </span>
                    <span className="project-list-owner">{project.owner?.name ? `负责人：${project.owner.name}` : "负责人未设置"}</span>
                  </button>
                );
              })
            ) : (
              <Empty description="暂无项目" />
            )}
          </div>
        </section>

        <section className="project-analysis-main">
          {selectedProject ? (
            <>
              <div className="surface-panel project-analysis-hero">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FolderKanban size={18} className="text-primary" />
                    <Typography.Title level={4} className="!mb-0 !text-[20px] !leading-7">
                      {selectedProject.name}
                    </Typography.Title>
                    {selectedProject.code ? <Tag>{selectedProject.code}</Tag> : null}
                    <Tag color={statusColor(selectedProject.status)}>{statusLabel(selectedProject.status)}</Tag>
                    <Tag color={projectHealth(selectedProject).color}>{projectHealth(selectedProject).label}</Tag>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-muted">
                    {selectedProject.description || "暂无项目说明。"} 负责人：{selectedProject.owner?.name ?? "未设置"}。
                  </div>
                  <div className="mt-2 text-xs text-muted">
                    项目周期：{dateText(selectedProject.startDate)} 至 {dateText(selectedProject.endDate)}
                  </div>
                </div>
                {canManage ? (
                  <Space className="project-hero-actions" wrap>
                    <Button icon={<Edit2 size={15} />} onClick={() => openEdit(selectedProject)}>
                      编辑
                    </Button>
                    <Popconfirm title="确认归档该项目？历史日报仍保留项目归属。" onConfirm={() => deleteProject.mutate(selectedProject.id)}>
                      <Button danger icon={<Trash2 size={15} />} />
                    </Popconfirm>
                  </Space>
                ) : null}
              </div>

              <div className="surface-panel project-focus-panel">
                <div className="project-focus-head">
                  <div className="min-w-0">
                    <div className="section-title">项目工作摘要</div>
                    <div className="section-subtitle">{rangeText(range)}</div>
                  </div>
                  <div className="project-focus-stats" aria-label="项目工作摘要数据">
                    <span><strong>{projectAnalysis.totalLogs}</strong>条日报/计划</span>
                    <span><strong>{projectAnalysis.members.length}</strong>人</span>
                    <span><strong>{projectAnalysis.riskBlockerCount}</strong>条风险/阻塞</span>
                    <span><strong>{projectAnalysis.totalHours.toFixed(1)}</strong>h</span>
                  </div>
                </div>
                <p className={`project-focus-summary ${projectAnalysis.riskBlockerCount ? "is-risk" : ""}`}>
                  {projectOverviewText(selectedProject, projectAnalysis)}
                </p>
                <div className="project-focus-grid">
                  <section>
                    <div className="project-focus-title">主要进展</div>
                    {projectAnalysis.completed.length ? (
                      <ul className="project-insight-list">
                        {projectAnalysis.completed.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <Empty description="当前周期暂无日报内容" />
                    )}
                  </section>
                  <section>
                    <div className="project-focus-title">风险/阻塞</div>
                    {projectAnalysis.risks.length ? (
                      <ul className="project-insight-list is-risk">
                        {projectAnalysis.risks.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    ) : (
                      <div className="project-focus-empty">暂无风险或阻塞。</div>
                    )}
                  </section>
                  <section>
                    <div className="project-focus-title">下一步动作</div>
                    <ul className="project-insight-list">
                      {projectActions.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                </div>
              </div>

              <div className="project-log-section">
                <div className="history-section-head">
                  <div>
                    <div className="section-title">近期日报</div>
                    <div className="section-subtitle">{projectAnalysis.totalLogs ? `${projectAnalysis.totalLogs} 条记录` : "暂无记录"}</div>
                  </div>
                </div>
                <Table
                  rowKey="id"
                  loading={projectLogs.isFetching}
                  dataSource={projectLogs.data ?? []}
                  columns={logColumns}
                  locale={{ emptyText: <Empty description="当前项目暂无日报记录" /> }}
                  pagination={{ pageSize: 6 }}
                  onRow={(record) => ({
                    onDoubleClick: () => openLogDetail(record)
                  })}
                />
              </div>

              <div className="surface-panel project-communication-panel">
                <div className="project-focus-head">
                  <div className="min-w-0">
                    <div className="section-title">沟通来源</div>
                    <div className="section-subtitle">来自企业微信群的项目线索，确认后才会写入正式日报。</div>
                  </div>
                  <div className="project-focus-stats" aria-label="项目沟通来源数据">
                    <span><strong>{selectedProjectSources.length}</strong>个群聊</span>
                    <span><strong>{selectedProjectDrafts.length}</strong>条候选</span>
                    <span><strong>{selectedProjectDrafts.reduce((sum, item) => sum + (item.risks?.length ?? 0), 0)}</strong>条风险</span>
                  </div>
                </div>
                {selectedProjectSources.length || selectedProjectDrafts.length ? (
                  <div className="project-communication-grid">
                    <section>
                      <div className="project-focus-title">
                        <MessageSquare size={15} />
                        已绑定群聊
                      </div>
                      {selectedProjectSources.length ? (
                        <div className="project-source-list">
                          {selectedProjectSources.map((source) => (
                            <div key={source.id} className="project-source-item">
                              <strong>{source.name}</strong>
                              <span>{source.chatId}</span>
                              <div>
                                <Tag color={source.generateLogDrafts ? "green" : "default"}>{source.generateLogDrafts ? "生成草稿" : "不生成草稿"}</Tag>
                                <Tag color={source.generateProjectRisks ? "orange" : "default"}>{source.generateProjectRisks ? "识别风险" : "不识别风险"}</Tag>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="project-focus-empty">暂无绑定群聊，可在企业微信集成页绑定项目群。</div>
                      )}
                    </section>
                    <section>
                      <div className="project-focus-title">
                        <AlertTriangle size={15} />
                        候选线索
                      </div>
                      {selectedProjectDrafts.length ? (
                        <ul className="project-insight-list is-risk">
                          {selectedProjectDrafts.slice(0, 4).map((draft) => (
                            <li key={draft.id}>
                              {draft.title} · {draft.risks?.[0] ?? draft.nextActions?.[0] ?? "待确认"}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="project-focus-empty">暂无来自群聊的项目候选内容。</div>
                      )}
                    </section>
                  </div>
                ) : (
                  <Empty description="暂无沟通来源，后续可在企业微信集成页绑定项目群" />
                )}
              </div>
            </>
          ) : (
            <div className="surface-panel p-8">
              <Empty description="暂无可查看项目" />
            </div>
          )}
        </section>

        <aside className="surface-panel project-ai-panel">
          {selectedProject ? (
            <>
              <div className="project-ai-head">
                <div className="project-ai-icon">
                  <Bot size={18} />
                </div>
                <div className="min-w-0">
                  <div className="project-ai-title">项目 AI 助手</div>
                  <div className="project-ai-context">
                    当前项目 · {rangeText(range)} · {projectAnalysis.totalLogs} 条日报 · {projectAnalysis.members.length} 个成员
                  </div>
                </div>
              </div>

              <div className="project-ai-quick">
                {projectQuickQuestions.map((item) => (
                  <button key={item} type="button" disabled={projectChat.isPending} onClick={() => askProjectQuestion(projectQuestionPrompt(item))}>
                    {item}
                  </button>
                ))}
              </div>

              <div ref={projectChatThreadRef} className="project-ai-thread">
                {projectChatMessages.length ? (
                  projectChatMessages.map((item) => (
                    <div key={item.id} className={`project-ai-message is-${item.role}`}>
                      <div className="project-ai-message-body">
                        {item.role === "assistant" ? <div className="ai-copilot-markdown">{renderAssistantMarkdown(item.content)}</div> : item.content}
                      </div>
                      {item.role === "assistant" ? (
                        <div className="project-ai-sources">
                          <div className="project-ai-source-title">
                            依据 · {item.contextCount ?? 0} 条上下文
                          </div>
                          {item.sources?.length ? (
                            item.sources.slice(0, 4).map((source) => {
                              const sourceLog = projectLogById.get(source.id);
                              return (
                                <button
                                  key={source.id}
                                  type="button"
                                  className="project-ai-source"
                                  disabled={!sourceLog}
                                  onClick={() => sourceLog && openLogDetail(sourceLog)}
                                >
                                  <span>{dayjs(source.date).format("MM-DD")} · {source.userName}</span>
                                  <strong>{source.title}</strong>
                                  <em>
                                    {source.evidence}
                                    {source.riskCount + source.blockerCount > 0 ? ` · 风险/阻塞 ${source.riskCount + source.blockerCount} 条` : ""}
                                  </em>
                                </button>
                              );
                            })
                          ) : (
                            <div className="project-ai-source-empty">暂无可展示来源。</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="project-ai-empty">
                    <strong>问问这个项目</strong>
                    <span>可以问近期进展、风险/阻塞、项目周报和下一步动作。回答会带来源日报。</span>
                  </div>
                )}
                {projectChat.isPending ? (
                  <div className="project-ai-message is-assistant">
                    <div className="project-ai-message-body">正在读取项目日报并生成回答…</div>
                  </div>
                ) : null}
              </div>

              <div className="project-ai-input-row">
                <Input.TextArea
                  value={projectChatInput}
                  autoSize={{ minRows: 1, maxRows: 4 }}
                  placeholder="问问这个项目…"
                  disabled={projectChat.isPending}
                  onChange={(event) => setProjectChatInput(event.target.value)}
                  onPressEnter={(event) => {
                    if (!event.shiftKey) {
                      event.preventDefault();
                      askProjectQuestion();
                    }
                  }}
                />
                <Button
                  type="primary"
                  icon={<Send size={15} />}
                  disabled={!projectChatInput.trim() || projectChat.isPending}
                  loading={projectChat.isPending}
                  onClick={() => askProjectQuestion()}
                >
                  发送
                </Button>
              </div>
            </>
          ) : (
            <Empty description="选择项目后可使用项目 AI 助手" />
          )}
        </aside>
      </div>

      <Modal
        title={editing ? "编辑项目" : "新增项目"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveProject.isPending}
        width={720}
      >
        <Form form={form} layout="vertical" onFinish={(values) => saveProject.mutate(values)}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="name" label="项目名称" rules={[{ required: true, min: 2 }]}>
              <Input placeholder="例如：Work Calendar AI 商业化版本" />
            </Form.Item>
            <Form.Item name="code" label="项目编号">
              <Input placeholder="例如：WCA" maxLength={32} />
            </Form.Item>
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select options={statusOptions.map((item) => ({ value: item.value, label: item.label }))} />
            </Form.Item>
            <Form.Item name="ownerUserId" label="负责人">
              <Select allowClear showSearch optionFilterProp="label" placeholder="选择负责人" loading={org.isFetching} options={userOptions} />
            </Form.Item>
            <Form.Item name="startDate" label="开始日期">
              <DatePicker className="w-full" />
            </Form.Item>
            <Form.Item name="endDate" label="结束日期">
              <DatePicker className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="项目说明">
            <Input.TextArea rows={4} placeholder="只填写必要背景、目标或范围，不做复杂项目管理。" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detailLog ? <WorkLogDetailTitle record={detailLog} readOnly={!canEditWorkLog(detailLog)} /> : "日报详情"}
        open={Boolean(detailLog)}
        onClose={() => {
          setDetailLog(null);
          setDetailEditing(false);
        }}
        width={720}
        zIndex={1500}
        extra={
          detailLog && canEditWorkLog(detailLog) ? (
            detailEditing ? (
              <Space>
                <Popconfirm title="确认删除这条日报？删除后不会进入统计和汇报。" onConfirm={() => deleteProjectWorkLog.mutate(detailLog.id)}>
                  <Button danger icon={<Trash2 size={15} />} loading={deleteProjectWorkLog.isPending && deleteProjectWorkLog.variables === detailLog.id}>
                    删除记录
                  </Button>
                </Popconfirm>
                <Button onClick={() => setDetailEditing(false)}>取消编辑</Button>
                <Button type="primary" loading={updateProjectWorkLog.isPending} onClick={() => workLogForm.submit()}>
                  保存修改
                </Button>
              </Space>
            ) : (
              <Space>
                <Popconfirm title="确认删除这条日报？删除后不会进入统计和汇报。" onConfirm={() => deleteProjectWorkLog.mutate(detailLog.id)}>
                  <Button danger icon={<Trash2 size={15} />} loading={deleteProjectWorkLog.isPending && deleteProjectWorkLog.variables === detailLog.id}>
                    删除记录
                  </Button>
                </Popconfirm>
                <Button icon={<Edit2 size={15} />} onClick={() => setDetailEditing(true)}>
                  编辑记录
                </Button>
              </Space>
            )
          ) : null
        }
      >
        {detailLog ? (
          <div className="project-log-detail">
            {detailEditing ? (
              <Form form={workLogForm} layout="vertical" onFinish={(values) => updateProjectWorkLog.mutate({ id: detailLog.id, values })}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Form.Item name="date" label="日期" rules={[{ required: true }]}>
                    <DatePicker className="w-full" />
                  </Form.Item>
                  <Form.Item name="hours" label="工时">
                    <InputNumber className="w-full" min={0} max={24} step={0.5} />
                  </Form.Item>
                  <Form.Item name="projectId" label="关联项目">
                    <Select allowClear showSearch optionFilterProp="label" dropdownStyle={{ zIndex: 1800 }} options={(projects.data ?? []).map((item) => ({ value: item.id, label: item.code ? `${item.code} · ${item.name}` : item.name }))} />
                  </Form.Item>
                </div>
                <Form.Item name="title" label="标题" rules={[{ required: true, min: 2 }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="content" label="工作内容" rules={[{ required: true, min: 2 }]}>
                  <Input.TextArea rows={6} />
                </Form.Item>
              </Form>
            ) : (
              <WorkLogDetailView record={detailLog} projectNameFallback={selectedProject?.name} showTimeInfo={false} />
            )}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
