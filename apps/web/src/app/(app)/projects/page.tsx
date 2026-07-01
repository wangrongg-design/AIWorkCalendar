"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DatePicker, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Tag, Typography, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { Bot, Edit2, Plus, Search, Send, Trash2 } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { WorkLogDetailTitle, WorkLogDetailView } from "@/components/WorkLogDetailView";
import { apiFetch } from "@/lib/api";
import { hasAnyRole, useAuthStore } from "@/lib/auth-store";
import { OrgUser, Project, ProjectStatus, WorkLog } from "@/lib/types";

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

type ProjectListStats = ReturnType<typeof summarizeProjectLogs>;

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

function buildWorkLogRangeQuery(range: [Dayjs, Dayjs] | null) {
  const params = new URLSearchParams();
  if (range) {
    params.set("from", range[0].format("YYYY-MM-DD"));
    params.set("to", range[1].format("YYYY-MM-DD"));
  }
  return params.toString() ? `/work-logs?${params.toString()}` : "/work-logs";
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
  if (label === "总结最近 7 天进展") return "请总结这个项目最近 7 天的进展，按已完成、正在推进、需要跟进输出，并列出依据日报。";
  if (label === "找出当前风险") return "这个项目当前最大的风险或阻塞是什么？请给出结论、依据日报和建议动作。";
  if (label === "生成项目周报") return "请基于当前项目日报生成一份项目周报，包含关键进展、风险/阻塞、下周动作和来源。";
  if (label === "整理负责人待办") return "请从这个项目最近日报中提取下一步待办，按负责人或事项整理，并说明依据。";
  if (label === "生成客户同步摘要") return "请生成一份适合发给客户或业务方的项目同步摘要，包含进展、风险、下一步和来源依据。";
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

function isLogInRange(log: WorkLog, range: [Dayjs, Dayjs] | null) {
  if (!range) return true;
  const date = dayjs(log.date);
  return !date.isBefore(range[0], "day") && !date.isAfter(range[1], "day");
}

function summarizeLogsByProject(logs: WorkLog[]) {
  const grouped = new Map<string, WorkLog[]>();
  logs.forEach((log) => {
    if (!log.projectId) return;
    grouped.set(log.projectId, [...(grouped.get(log.projectId) ?? []), log]);
  });
  return new Map(Array.from(grouped.entries()).map(([projectId, items]) => [projectId, summarizeProjectLogs(items)]));
}

function projectMatchesSearch(project: Project, keyword: string) {
  if (!keyword) return true;
  const normalized = keyword.toLowerCase();
  return [project.name, project.code, project.owner?.name, project.description]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function projectRecentText(stats?: ProjectListStats) {
  if (!stats?.latestDate) return "当前周期暂无日报";
  return `最近更新 ${dayjs(stats.latestDate).format("MM-DD")}`;
}

function assistantIntro(project: Project, analysis: ProjectListStats, range: [Dayjs, Dayjs] | null) {
  if (!analysis.totalLogs) {
    return {
      overview: "当前项目暂无来源日报，先关联项目日报或调整时间范围。",
      latestProgress: `${rangeText(range)} 内没有可分析记录。`,
      action: "可以先让成员按项目提交日报，或扩大日期范围后再提问。"
    };
  }
  const latestText = analysis.latestDate ? `最近更新 ${dayjs(analysis.latestDate).format("MM-DD")}` : "暂无最近更新";
  return {
    overview: projectOverviewText(project, analysis),
    latestProgress: `${rangeText(range)} · ${analysis.totalLogs} 条日报/计划 · ${analysis.members.length} 个成员 · ${latestText}。`,
    action: analysis.riskBlockerCount ? "建议先追问当前风险，确认负责人和处理动作。" : "可以继续生成项目周报、整理负责人待办或准备客户同步摘要。"
  };
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
  const [projectSearch, setProjectSearch] = useState("");
  const [projectRiskFilter, setProjectRiskFilter] = useState<"ALL" | "RISK">("ALL");
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

  const allProjectLogs = useQuery({
    queryKey: [
      "project-center-work-logs",
      range?.[0].format("YYYY-MM-DD") ?? "all",
      range?.[1].format("YYYY-MM-DD") ?? "all"
    ],
    queryFn: () => apiFetch<WorkLog[]>(buildWorkLogRangeQuery(range))
  });

  const rangeFilteredAllLogs = useMemo(() => (allProjectLogs.data ?? []).filter((item) => isLogInRange(item, range)), [allProjectLogs.data, range]);
  const projectStatsById = useMemo(() => summarizeLogsByProject(rangeFilteredAllLogs), [rangeFilteredAllLogs]);

  const filteredProjects = useMemo(() => {
    const keyword = projectSearch.trim();
    return (projects.data ?? [])
      .filter((item) => (statusFilter === "ALL" ? true : item.status === statusFilter))
      .filter((item) => projectMatchesSearch(item, keyword))
      .filter((item) => (projectRiskFilter === "RISK" ? (projectStatsById.get(item.id)?.riskBlockerCount ?? 0) > 0 : true));
  }, [projectRiskFilter, projectSearch, projectStatsById, projects.data, statusFilter]);

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

  const projectAnalysis = useMemo(() => {
    return summarizeProjectLogs((projectLogs.data ?? []).filter((item) => isLogInRange(item, range)));
  }, [projectLogs.data, range]);
  const sourceLogs = useMemo(() => (projectLogs.data ?? []).filter((item) => isLogInRange(item, range)), [projectLogs.data, range]);
  const projectLogById = useMemo(() => new Map(sourceLogs.map((item) => [item.id, item])), [sourceLogs]);
  const projectQuickQuestions = useMemo(
    () =>
      selectedProject
        ? [
            "总结最近 7 天进展",
            "找出当前风险",
            "生成项目周报",
            "整理负责人待办",
            "生成客户同步摘要"
          ]
        : [],
    [selectedProject]
  );
  const projectAssistantIntro = useMemo(
    () => (selectedProject ? assistantIntro(selectedProject, projectAnalysis, range) : null),
    [projectAnalysis, range, selectedProject]
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

  const openLogDetail = (record: WorkLog) => {
    setDetailLog(record);
    setDetailEditing(false);
  };

  const askProjectQuestion = (question = projectChatInput) => {
    const normalized = question.trim();
    if (!normalized || !selectedProject || projectChat.isPending) return;
    if (!projectAnalysis.totalLogs) {
      message.info("当前项目暂无来源日报，先关联项目日报或调整时间范围。");
      return;
    }
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

  return (
    <div className="page-stack project-center-page">
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
        <div className="project-toolbar-control">
          <span>状态</span>
          <Select
            value={statusFilter}
            style={{ width: 132 }}
            onChange={(value) => {
              setStatusFilter(value);
              setSelectedProjectId(undefined);
            }}
            options={[{ value: "ACTIVE", label: "进行中" }, { value: "ALL", label: "全部项目" }, ...statusOptions.filter((item) => item.value !== "ACTIVE").map((item) => ({ value: item.value, label: item.label }))]}
          />
        </div>
        <div className="project-toolbar-control is-range">
          <span>周期</span>
          <DatePicker.RangePicker
            value={range}
            onChange={(dates) => setRange(dates?.[0] && dates?.[1] ? [dates[0], dates[1]] : null)}
            allowClear
          />
        </div>
        <Input
          className="project-toolbar-search"
          prefix={<Search size={15} />}
          allowClear
          value={projectSearch}
          placeholder="搜索项目、编号、负责人"
          onChange={(event) => {
            setProjectSearch(event.target.value);
            setSelectedProjectId(undefined);
          }}
        />
        <div className="project-toolbar-control">
          <span>风险</span>
          <Select
            value={projectRiskFilter}
            style={{ width: 132 }}
            onChange={(value) => {
              setProjectRiskFilter(value);
              setSelectedProjectId(undefined);
            }}
            options={[
              { value: "ALL", label: "全部" },
              { value: "RISK", label: "有风险/阻塞" }
            ]}
          />
        </div>
      </div>

      <div className="project-analysis-layout">
        <section className="surface-panel project-list-panel">
          <div className="section-head project-list-head">
            <div>
              <div className="section-title">项目列表</div>
              <div className="section-subtitle">{filteredProjects.length} 个项目 · {rangeText(range)}</div>
            </div>
          </div>
          <div className="project-list">
            {filteredProjects.length ? (
              filteredProjects.map((project) => {
                const health = projectHealth(project);
                const active = project.id === selectedProject?.id;
                const stats = projectStatsById.get(project.id);
                const riskBlockerCount = stats?.riskBlockerCount ?? 0;
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
                      {riskBlockerCount ? <Tag color="red">风险/阻塞 {riskBlockerCount}</Tag> : null}
                    </span>
                    <span className="project-list-owner">{project.owner?.name ? `负责人：${project.owner.name}` : "负责人未设置"}</span>
                    <span className="project-list-foot">
                      <span>{stats?.totalLogs ?? 0} 条日报</span>
                      <span>{projectRecentText(stats)}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <Empty description="暂无匹配项目" />
            )}
          </div>
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
                    {selectedProject.name}
                  </div>
                </div>
              </div>

              <div className="project-ai-coverage" aria-label="项目 AI 助手数据覆盖">
                <span>{rangeText(range)}</span>
                <span>{projectAnalysis.totalLogs} 条日报</span>
                <span>{projectAnalysis.members.length} 个成员</span>
                <span>{projectAnalysis.riskBlockerCount} 条风险/阻塞</span>
              </div>

              <div className="project-ai-quick">
                {projectQuickQuestions.map((item) => (
                  <button key={item} type="button" disabled={projectChat.isPending || !projectAnalysis.totalLogs} onClick={() => askProjectQuestion(projectQuestionPrompt(item))}>
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
                  <div className={`project-ai-empty ${projectAnalysis.totalLogs ? "" : "is-no-data"}`}>
                    <strong>项目概览</strong>
                    <span>{projectAssistantIntro?.overview}</span>
                    <strong>最新进度</strong>
                    <span>{projectAssistantIntro?.latestProgress}</span>
                    <strong>建议动作</strong>
                    <span>{projectAssistantIntro?.action}</span>
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
                  placeholder={projectAnalysis.totalLogs ? "问问这个项目…" : "当前项目暂无来源日报"}
                  disabled={projectChat.isPending || !projectAnalysis.totalLogs}
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
                  disabled={!projectChatInput.trim() || projectChat.isPending || !projectAnalysis.totalLogs}
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
        title={detailLog ? <WorkLogDetailTitle record={detailLog} currentUserId={user?.id} readOnly={!canEditWorkLog(detailLog)} /> : "日报详情"}
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
