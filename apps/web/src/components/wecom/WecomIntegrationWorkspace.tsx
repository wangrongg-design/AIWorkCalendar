"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Tooltip, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { AlertTriangle, BookOpen, CheckCircle2, FileText, GitBranch, Link2, MessageSquare, PlayCircle, RotateCw, ShieldCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  CommunicationInsight,
  CommunicationFile,
  CommunicationFileDownloadStatus,
  CommunicationProjectSuggestion,
  CommunicationProjectSuggestionStatus,
  CommunicationSource,
  CommunicationSourceType,
  CommunicationSyncStatus,
  Department,
  OrgUser,
  Project,
  WecomExternalContactConsent,
  WecomExternalConsentStatus,
  WecomIntegrationMode,
  WecomOverview,
  WecomUserBinding,
  WecomUserMappingStatus
} from "@/lib/types";

type Props = {
  canManage: boolean;
  departments: Department[];
  users: OrgUser[];
  departmentFullPath: (departmentId?: string | null) => string;
};

type IntegrationForm = {
  corpId: string;
  msgAuditSecretRef: string;
  rsaPrivateKeyRef: string;
  rsaPublicKeyConfigured: boolean;
  trustedIpNote?: string;
  mode: WecomIntegrationMode;
  syncDepartmentIds?: string[];
  syncUserIds?: string[];
  syncChatIds?: string[];
  syncFiles: boolean;
  generateLogDrafts: boolean;
  generateProjectRisks: boolean;
  retentionDays: number;
};

type SourceForm = {
  name: string;
  chatId: string;
  sourceType: CommunicationSourceType;
  projectIds?: string[];
  departmentIds?: string[];
  memberScopeUserIds?: string[];
  generateLogDrafts: boolean;
  generateProjectRisks: boolean;
  syncFiles: boolean;
  retentionDays: number;
};

const modeOptions: Array<{ value: WecomIntegrationMode; label: string; description: string }> = [
  { value: "LIGHT", label: "轻配置", description: "推荐。系统自动匹配成员，管理员只确认异常项。" },
  { value: "ZERO", label: "零配置", description: "只同步消息，生成未归类沟通线索。" },
  { value: "PRECISE", label: "精准配置", description: "配置项目群、部门群、关键词、范围和保留周期。" }
];

const sourceTypeOptions: Array<{ value: CommunicationSourceType; label: string; color: string }> = [
  { value: "PROJECT", label: "项目群", color: "blue" },
  { value: "DEPARTMENT", label: "部门群", color: "cyan" },
  { value: "GENERAL", label: "通用群", color: "default" }
];

const mappingStatusLabels: Record<WecomUserMappingStatus, { label: string; color: string }> = {
  AUTO: { label: "自动匹配", color: "blue" },
  CONFIRMED: { label: "已确认", color: "green" },
  CONFLICT: { label: "需确认", color: "orange" },
  UNMAPPED: { label: "未匹配", color: "red" },
  EXTERNAL: { label: "外部联系人", color: "default" }
};

const syncStatusLabels: Record<CommunicationSyncStatus, { label: string; color: string }> = {
  PENDING: { label: "待同步", color: "default" },
  SYNCING: { label: "同步中", color: "blue" },
  OK: { label: "正常", color: "green" },
  ERROR: { label: "异常", color: "red" },
  PAUSED: { label: "已暂停", color: "orange" }
};

const fileStatusLabels: Record<CommunicationFileDownloadStatus, { label: string; color: string }> = {
  PENDING: { label: "待下载", color: "default" },
  DOWNLOADING: { label: "下载中", color: "blue" },
  DOWNLOADED: { label: "已保存", color: "green" },
  SKIPPED: { label: "已跳过", color: "default" },
  FAILED: { label: "失败", color: "red" }
};

const consentStatusLabels: Record<WecomExternalConsentStatus, { label: string; color: string }> = {
  UNKNOWN: { label: "未知", color: "default" },
  AGREED: { label: "已同意", color: "green" },
  DISAGREED: { label: "未同意", color: "red" },
  REVOKED: { label: "已撤回", color: "orange" }
};

const suggestionStatusLabels: Record<CommunicationProjectSuggestionStatus, { label: string; color: string }> = {
  PENDING: { label: "待确认", color: "orange" },
  CONFIRMED: { label: "已确认", color: "green" },
  REJECTED: { label: "已驳回", color: "default" }
};

const guideSections = [
  {
    title: "1. 这项能力能做什么",
    content:
      "企业微信集成可以将企业微信群中的工作沟通、文件和项目讨论同步到 AI Work Calendar。系统会根据发送人、群聊、项目关键词和文件内容，自动识别可形成日报、项目进展、风险和周期汇报的内容。同步内容默认只生成草稿，员工或管理员确认后才会进入正式工作日志。"
  },
  {
    title: "2. 使用前提",
    bullets: [
      "企业已使用企业微信。",
      "企业微信管理员已开通会话内容存档。",
      "管理员已配置存档成员和群聊范围。",
      "已在企业微信后台配置 RSA 公钥。",
      "已将服务器出口 IP 加入可信 IP。",
      "已获取 corpid 和会话内容存档 secret。",
      "如涉及客户群，需要确保外部联系人同意存档。"
    ]
  },
  {
    title: "3. 合规说明",
    bullets: [
      "本功能不读取个人微信。",
      "本功能不使用外挂、抓包或模拟登录。",
      "只处理企业微信授权范围内的工作沟通。",
      "不会自动将聊天记录提交为正式日报。",
      "所有日志草稿需要用户确认。",
      "管理员应提前告知员工使用范围和数据用途。",
      "外部联系人不同意存档时，不得同步或分析相关内容。"
    ]
  },
  {
    title: "4. 推荐配置方式",
    bullets: [
      "首次接入建议使用轻配置模式。",
      "系统会自动匹配大部分成员。",
      "管理员只需要处理未匹配、重名、部门不一致等异常项。",
      "项目群可以后续逐步绑定，不必一开始全部配置。",
      "越多项目群绑定，AI 归因越准确。"
    ]
  },
  {
    title: "5. 推荐的微信群使用方式",
    bullets: [
      "每个项目建议建立独立项目群。",
      "一个项目可以绑定多个群，例如研发群、客户沟通群、测试验收群。",
      "部门群适合生成团队风险和个人日报候选。",
      "综合大群建议设为通用群，由 AI 识别后人工确认项目。",
      "群名建议包含项目名或项目编号，例如：P2026-支付接入项目群、小程序改版-研发群、客户A-验收沟通群。"
    ]
  },
  {
    title: "6. 如何绑定项目群",
    steps: [
      "打开团队 / 企业设置 / 企业微信集成。",
      "完成企业微信连接。",
      "进入沟通来源。",
      "选择一个已同步的企业微信群。",
      "设置来源类型为项目群。",
      "选择绑定项目。",
      "设置是否同步文件。",
      "开启生成日志草稿和生成项目风险。",
      "保存配置。",
      "等待下一次同步，或点击立即同步。"
    ]
  },
  {
    title: "7. 如何处理成员映射",
    bullets: [
      "系统优先使用企业微信 userid 映射成员。",
      "其次使用手机号、邮箱、姓名 + 部门辅助匹配。",
      "管理员只需要确认异常项。",
      "重名或无法确认的成员不会自动生成日报。",
      "外部联系人不会生成员工日报。"
    ]
  },
  {
    title: "8. 员工如何确认日志草稿",
    steps: [
      "打开填报记录。",
      "点击从沟通记录生成草稿。",
      "查看系统识别的日期、项目、内容、风险和来源消息。",
      "补充工时或修改项目。",
      "点击确认提交。",
      "提交后，该日志会进入工作日历、项目页和 AI 报告。"
    ]
  },
  {
    title: "9. 文件如何使用",
    bullets: [
      "群文件会作为沟通来源文件保存。",
      "系统会提取文件名、类型、上传人、来源群、时间。",
      "支持对可解析文件生成摘要。",
      "文件可作为日志、项目风险和 AI 报告的来源证据。",
      "文件是否进入正式日志附件，需要用户确认。"
    ]
  },
  {
    title: "10. 数据保留和权限",
    bullets: [
      "管理员可设置保留周期。",
      "员工只能查看与自己相关或权限范围内的来源。",
      "部门经理只能查看本部门范围。",
      "企业管理员可查看企业范围。",
      "所有查看、导出、删除和生成动作都会记录审计日志。"
    ]
  },
  {
    title: "11. 常见问题",
    faqs: [
      ["是否支持个人微信群？", "不支持。本功能只支持企业微信合规能力。"],
      ["是否会自动替员工写日报？", "不会。系统只生成草稿，员工确认后才提交。"],
      ["是否必须逐个绑定员工？", "不需要。系统会自动匹配成员，管理员只处理异常项。"],
      ["是否必须给每个项目配置微信群？", "不是必须，但建议项目有独立群。没有独立群时，可以使用通用群加人工确认项目。"],
      ["一个项目可以绑定多个群吗？", "可以。适合研发群、客户群、测试群等多来源项目。"],
      ["一个群可以绑定多个项目吗？", "可以，但不建议作为默认方式。多项目群应开启人工确认。"],
      ["能否按发送人自动生成对应员工日报？", "可以。系统会根据企业微信 userid 映射到系统成员，再生成该成员的候选日报。名称只作为辅助信息，不作为唯一匹配依据。"],
      ["文件会自动进入日报附件吗？", "不会。文件会先作为来源证据，用户确认后才可关联到日志。"],
      ["外部联系人不同意存档怎么办？", "不得同步和分析该外部联系人的沟通内容。"],
      ["同步失败怎么办？", "检查会话存档 secret、RSA 密钥、可信 IP、存档范围和企业微信服务状态。"]
    ]
  }
];

function statusTag(status: CommunicationSyncStatus) {
  const item = syncStatusLabels[status] ?? syncStatusLabels.PENDING;
  return <Tag color={item.color}>{item.label}</Tag>;
}

function mappingTag(status: WecomUserMappingStatus) {
  const item = mappingStatusLabels[status];
  return <Tag color={item.color}>{item.label}</Tag>;
}

function sourceTypeTag(type: CommunicationSourceType) {
  const item = sourceTypeOptions.find((option) => option.value === type);
  return <Tag color={item?.color ?? "default"}>{item?.label ?? type}</Tag>;
}

function dateTimeText(value?: string | null) {
  return value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-";
}

function confidenceText(value?: number | null) {
  return `${Math.round(Number(value ?? 0) * 100)}%`;
}

function fileSizeText(value?: number | null) {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function WecomIntegrationWorkspace({ canManage, departments, users, departmentFullPath }: Props) {
  const queryClient = useQueryClient();
  const [integrationForm] = Form.useForm<IntegrationForm>();
  const [sourceForm] = Form.useForm<SourceForm>();
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<CommunicationSource | null>(null);
  const [bindingTargets, setBindingTargets] = useState<Record<string, string | undefined>>({});

  const overview = useQuery({
    queryKey: ["wecom-overview"],
    queryFn: () => apiFetch<WecomOverview>("/wecom/overview")
  });

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/projects")
  });

  const activeIntegration = overview.data?.activeIntegration ?? null;
  const setup = overview.data?.setupSummary;
  const workerRuntime = overview.data?.workerRuntime;

  useEffect(() => {
    if (!activeIntegration) {
      integrationForm.setFieldsValue({
        mode: "LIGHT",
        rsaPublicKeyConfigured: false,
        syncFiles: false,
        generateLogDrafts: true,
        generateProjectRisks: true,
        retentionDays: 180
      });
      return;
    }
    integrationForm.setFieldsValue({
      corpId: activeIntegration.corpId,
      msgAuditSecretRef: activeIntegration.msgAuditSecretRef,
      rsaPrivateKeyRef: activeIntegration.rsaPrivateKeyRef,
      rsaPublicKeyConfigured: activeIntegration.rsaPublicKeyConfigured,
      trustedIpNote: activeIntegration.trustedIpNote ?? undefined,
      mode: activeIntegration.mode,
      syncDepartmentIds: activeIntegration.syncDepartmentIds,
      syncUserIds: activeIntegration.syncUserIds,
      syncChatIds: activeIntegration.syncChatIds,
      syncFiles: activeIntegration.syncFiles,
      generateLogDrafts: activeIntegration.generateLogDrafts,
      generateProjectRisks: activeIntegration.generateProjectRisks,
      retentionDays: activeIntegration.retentionDays
    });
  }, [activeIntegration, integrationForm]);

  const departmentOptions = useMemo(
    () => departments.map((item) => ({ value: item.id, label: departmentFullPath(item.id) })).sort((a, b) => a.label.localeCompare(b.label, "zh-CN")),
    [departmentFullPath, departments]
  );

  const userOptions = useMemo(
    () => users.map((item) => ({ value: item.id, label: `${item.name} · ${item.departmentName ?? departmentFullPath(item.departmentId)}` })),
    [departmentFullPath, users]
  );

  const projectOptions = useMemo(
    () => (projects.data ?? []).map((item) => ({ value: item.id, label: item.code ? `${item.code} · ${item.name}` : item.name })),
    [projects.data]
  );

  const projectNameById = useMemo(() => new Map((projects.data ?? []).map((item) => [item.id, item.code ? `${item.code} · ${item.name}` : item.name])), [projects.data]);

  const saveIntegration = useMutation({
    mutationFn: (values: IntegrationForm) =>
      apiFetch("/wecom/integrations", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: () => {
      message.success("企业微信配置已保存");
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "保存企业微信配置失败")
  });

  const testIntegration = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>("/wecom/integrations/test", { method: "POST" }),
    onSuccess: (result) => {
      message[result.ok ? "success" : "warning"](result.message);
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "测试连接失败")
  });

  const autoMatch = useMutation({
    mutationFn: () => apiFetch("/wecom/mappings/auto-match", { method: "POST" }),
    onSuccess: () => {
      message.success("已完成一轮成员自动匹配");
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "自动匹配失败")
  });

  const syncText = useMutation({
    mutationFn: () => apiFetch("/wecom/sync/text", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      message.success("已同步文本消息并生成候选草稿");
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
      queryClient.invalidateQueries({ queryKey: ["wecom-log-drafts"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "同步文本消息失败")
  });

  const syncArchive = useMutation({
    mutationFn: () => apiFetch("/wecom/sync/archive", { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      message.success("已同步会话存档消息、文件和项目建议");
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
      queryClient.invalidateQueries({ queryKey: ["wecom-log-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["wecom-sources"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "同步会话存档失败")
  });

  const saveSource = useMutation({
    mutationFn: (values: SourceForm) =>
      apiFetch<CommunicationSource>(editingSource ? `/wecom/sources/${editingSource.id}` : "/wecom/sources", {
        method: editingSource ? "PATCH" : "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: () => {
      message.success("沟通来源已保存");
      setSourceModalOpen(false);
      setEditingSource(null);
      sourceForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "沟通来源保存失败")
  });

  const updateBinding = useMutation({
    mutationFn: ({ id, userId, mappingStatus }: { id: string; userId?: string; mappingStatus: WecomUserMappingStatus }) =>
      apiFetch<WecomUserBinding>(`/wecom/bindings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ userId: userId ?? null, mappingStatus })
      }),
    onSuccess: () => {
      message.success("成员映射已更新");
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "成员映射更新失败")
  });

  const updateSuggestion = useMutation({
    mutationFn: ({ id, status }: { id: string; status: CommunicationProjectSuggestionStatus }) =>
      apiFetch<CommunicationProjectSuggestion>(`/wecom/project-suggestions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      }),
    onSuccess: (_, variables) => {
      message.success(variables.status === "CONFIRMED" ? "已确认项目群绑定建议" : "已驳回项目群绑定建议");
      queryClient.invalidateQueries({ queryKey: ["wecom-overview"] });
      queryClient.invalidateQueries({ queryKey: ["wecom-sources"] });
    },
    onError: (error) => message.error(error instanceof Error ? error.message : "项目群建议更新失败")
  });

  const openSourceModal = (source?: CommunicationSource) => {
    setEditingSource(source ?? null);
    sourceForm.resetFields();
    sourceForm.setFieldsValue(
      source
        ? {
            name: source.name,
            chatId: source.chatId,
            sourceType: source.sourceType,
            projectIds: source.projectIds,
            departmentIds: source.departmentIds,
            memberScopeUserIds: source.memberScopeUserIds,
            generateLogDrafts: source.generateLogDrafts,
            generateProjectRisks: source.generateProjectRisks,
            syncFiles: source.syncFiles,
            retentionDays: source.retentionDays
          }
        : {
            sourceType: "GENERAL",
            projectIds: [],
            departmentIds: [],
            memberScopeUserIds: [],
            generateLogDrafts: true,
            generateProjectRisks: true,
            syncFiles: false,
            retentionDays: 180
          }
    );
    setSourceModalOpen(true);
  };

  const sourceColumns: ColumnsType<CommunicationSource> = [
    {
      title: "群聊",
      width: 240,
      render: (_, record) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{record.name}</div>
          <div className="mt-1 text-xs text-muted">chat_id：{record.chatId}</div>
        </div>
      )
    },
    { title: "类型", width: 100, render: (_, record) => sourceTypeTag(record.sourceType) },
    {
      title: "归属",
      render: (_, record) => (
        <Space wrap>
          {record.projectIds.map((id) => <Tag key={id} color="blue">{projectNameById.get(id) ?? id}</Tag>)}
          {record.departmentIds.map((id) => <Tag key={id} color="cyan">{departmentFullPath(id)}</Tag>)}
          {!record.projectIds.length && !record.departmentIds.length ? <Tag>待归类</Tag> : null}
        </Space>
      )
    },
    {
      title: "生成",
      width: 180,
      render: (_, record) => (
        <Space wrap size={4}>
          <Tag color={record.generateLogDrafts ? "green" : "default"}>{record.generateLogDrafts ? "日志草稿" : "不生成草稿"}</Tag>
          <Tag color={record.generateProjectRisks ? "orange" : "default"}>{record.generateProjectRisks ? "项目风险" : "不识别风险"}</Tag>
        </Space>
      )
    },
    {
      title: "待处理",
      width: 150,
      render: (_, record) => (
        <div className="text-xs leading-5 text-muted">
          <div>候选草稿：{record.pendingDraftCount}</div>
          <div>待归类：{record.unclassifiedCount}</div>
        </div>
      )
    },
    {
      title: "同步",
      width: 160,
      render: (_, record) => (
        <div>
          {statusTag(record.lastSyncStatus)}
          <div className="mt-1 text-xs text-muted">{dateTimeText(record.lastSyncAt)}</div>
        </div>
      )
    },
    {
      title: "操作",
      width: 100,
      render: (_, record) =>
        canManage ? (
          <Button size="small" onClick={() => openSourceModal(record)}>
            编辑
          </Button>
        ) : (
          "-"
        )
    }
  ];

  const bindingColumns: ColumnsType<WecomUserBinding> = [
    {
      title: "企业微信成员",
      width: 220,
      render: (_, record) => (
        <div>
          <div className="font-medium text-ink">{record.wecomName}</div>
          <div className="mt-1 text-xs text-muted">userid：{record.wecomUserId}</div>
        </div>
      )
    },
    { title: "状态", width: 110, render: (_, record) => mappingTag(record.mappingStatus) },
    {
      title: "系统成员",
      width: 210,
      render: (_, record) => record.user?.name ?? (record.userId ? userOptions.find((item) => item.value === record.userId)?.label : "未匹配")
    },
    { title: "置信度", width: 90, render: (_, record) => confidenceText(record.confidence) },
    {
      title: "联系方式",
      render: (_, record) => [record.mobile, record.email].filter(Boolean).join(" / ") || "-"
    },
    {
      title: "确认",
      width: 270,
      render: (_, record) =>
        canManage && record.mappingStatus !== "EXTERNAL" ? (
          <Space.Compact className="w-full">
            <Select
              className="min-w-0 flex-1"
              allowClear
              showSearch
              optionFilterProp="label"
              value={bindingTargets[record.id] ?? record.userId ?? undefined}
              options={userOptions}
              onChange={(value) => setBindingTargets((current) => ({ ...current, [record.id]: value }))}
            />
            <Button
              loading={updateBinding.isPending}
              onClick={() =>
                updateBinding.mutate({
                  id: record.id,
                  userId: bindingTargets[record.id] ?? record.userId ?? undefined,
                  mappingStatus: "CONFIRMED"
                })
              }
            >
              确认
            </Button>
          </Space.Compact>
        ) : (
          "-"
        )
    }
  ];

  const draftColumns: ColumnsType<CommunicationInsight> = [
    {
      title: "候选草稿",
      render: (_, record) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{record.title}</div>
          <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{record.content}</div>
          <Space className="mt-2" wrap size={4}>
            <Tag>{dayjs(record.date).format("YYYY-MM-DD")}</Tag>
            <Tag color={record.confidence >= 0.8 ? "green" : "orange"}>置信度 {confidenceText(record.confidence)}</Tag>
            {record.missingFields?.length ? <Tag color="orange">需确认：{record.missingFields.join("、")}</Tag> : null}
          </Space>
        </div>
      )
    },
    { title: "归属人", width: 140, render: (_, record) => record.suggestedUser?.name ?? "未映射" },
    { title: "项目", width: 180, render: (_, record) => record.project?.name ?? record.projectHints?.[0] ?? "待确认" },
    {
      title: "来源",
      width: 180,
      render: (_, record) => (
        <div className="text-xs leading-5 text-muted">
          <div>{record.source?.name ?? "未知来源"}</div>
          <div>{record.sourceMessageIds?.length ?? 0} 条消息</div>
        </div>
      )
    },
    {
      title: "判断",
      width: 220,
      render: (_, record) => (
        <div className="text-xs leading-5 text-muted">
          <div>风险：{record.risks?.length ? record.risks.join("、") : "无"}</div>
          <div>下一步：{record.nextActions?.[0] ?? "确认后提交"}</div>
        </div>
      )
    }
  ];

  const fileColumns: ColumnsType<CommunicationFile> = [
    {
      title: "文件",
      render: (_, record) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{record.fileName}</div>
          <div className="mt-1 text-xs text-muted">
            {record.kind} · {fileSizeText(record.fileSize)} · {record.mimeType ?? "未知类型"}
          </div>
        </div>
      )
    },
    {
      title: "状态",
      width: 110,
      render: (_, record) => {
        const status = fileStatusLabels[record.downloadStatus];
        return <Tag color={status.color}>{status.label}</Tag>;
      }
    },
    { title: "来源群", width: 180, render: (_, record) => record.source?.name ?? "-" },
    { title: "上传人", width: 140, render: (_, record) => record.mappedUser?.name ?? record.uploadedByWecomUserId ?? record.externalUserId ?? "-" },
    {
      title: "摘要",
      render: (_, record) => <div className="line-clamp-2 text-xs leading-5 text-muted">{record.aiSummary ?? record.textContent ?? "暂无摘要"}</div>
    },
    {
      title: "客户同意",
      width: 110,
      render: (_, record) => {
        const status = consentStatusLabels[record.consentStatus];
        return <Tag color={status.color}>{status.label}</Tag>;
      }
    }
  ];

  const consentColumns: ColumnsType<WecomExternalContactConsent> = [
    {
      title: "外部联系人",
      render: (_, record) => (
        <div>
          <div className="font-medium text-ink">{record.externalName ?? record.externalUserId}</div>
          <div className="mt-1 text-xs text-muted">{record.externalUserId}</div>
        </div>
      )
    },
    {
      title: "存档同意",
      width: 110,
      render: (_, record) => {
        const status = consentStatusLabels[record.status];
        return <Tag color={status.color}>{status.label}</Tag>;
      }
    },
    { title: "最近检查", width: 170, render: (_, record) => dateTimeText(record.lastCheckedAt) }
  ];

  const suggestionColumns: ColumnsType<CommunicationProjectSuggestion> = [
    {
      title: "建议绑定",
      render: (_, record) => (
        <div className="min-w-0">
          <div className="font-medium text-ink">{record.source?.name ?? "企业微信群"} → {record.project?.name ?? "项目"}</div>
          <div className="mt-1 text-xs leading-5 text-muted">{record.reason}</div>
        </div>
      )
    },
    {
      title: "状态",
      width: 110,
      render: (_, record) => {
        const status = suggestionStatusLabels[record.status];
        return <Tag color={status.color}>{status.label}</Tag>;
      }
    },
    { title: "置信度", width: 100, render: (_, record) => confidenceText(record.confidence) },
    {
      title: "操作",
      width: 160,
      render: (_, record) =>
        canManage && record.status === "PENDING" ? (
          <Space size={6}>
            <Button size="small" loading={updateSuggestion.isPending} onClick={() => updateSuggestion.mutate({ id: record.id, status: "CONFIRMED" })}>
              确认
            </Button>
            <Button size="small" loading={updateSuggestion.isPending} onClick={() => updateSuggestion.mutate({ id: record.id, status: "REJECTED" })}>
              驳回
            </Button>
          </Space>
        ) : (
          "-"
        )
    }
  ];

  const steps = [
    { label: "连接企业微信", done: Boolean(activeIntegration), hint: activeIntegration ? "配置已保存" : "填写 corpid、secret 和 RSA 密钥" },
    { label: "选择同步范围", done: Boolean(activeIntegration?.syncDepartmentIds.length || activeIntegration?.syncUserIds.length || activeIntegration?.syncChatIds.length), hint: "可先用轻配置" },
    { label: "自动匹配成员", done: Boolean(setup?.autoMatched), hint: setup?.autoMatched ? `已匹配 ${setup.autoMatched} 人` : "一键完成初始匹配" },
    { label: "确认异常项", done: !setup?.needsConfirmation, hint: setup?.needsConfirmation ? `${setup.needsConfirmation} 项待确认` : "暂无异常" },
    { label: "开始同步", done: setup?.syncStatus === "OK", hint: setup?.lastSyncAt ? dateTimeText(setup.lastSyncAt) : "等待同步" }
  ];

  return (
    <div className="wecom-workspace">
      <Alert
        type="info"
        showIcon
        icon={<ShieldCheck size={18} />}
        message="仅支持企业微信会话内容存档"
        description="本阶段实现企业微信官方合规接入的配置、成员映射、沟通来源和文本消息候选草稿。不会接入个人微信、外挂、Hook、抓包、RPA 或模拟客户端。"
      />
      {workerRuntime ? (
        <Alert
          type={workerRuntime.mode === "official" && workerRuntime.officialReady ? "success" : "warning"}
          showIcon
          className="wecom-runtime-alert"
          message={workerRuntime.mode === "official" ? "正式企业微信同步模式" : "本地演示同步模式"}
          description={
            workerRuntime.mode === "official"
              ? workerRuntime.officialReady
                ? "已配置会话内容存档 SDK 适配器，同步会按企业微信官方 seq 增量拉取真实消息和文件。"
                : "正式模式需要配置 WECOM_MSGAUDIT_ADAPTER_CMD，连接企业微信官方会话内容存档 SDK 后才能同步真实消息。"
              : "当前只用于本地演示，不会连接真实企业微信。正式环境请切换 WECOM_MSGAUDIT_MODE=official 并配置 SDK 适配器。"
          }
        />
      ) : null}

      <section className="surface-panel wecom-setup-panel">
        <div className="section-head">
          <div>
            <div className="section-title">首次接入向导</div>
            <div className="section-subtitle">轻配置优先，系统自动完成大部分匹配，管理员只处理异常项。</div>
          </div>
          <Space wrap>
            <Button icon={<RotateCw size={16} />} onClick={() => overview.refetch()} loading={overview.isFetching}>
              刷新状态
            </Button>
            {canManage ? (
              <>
                <Button icon={<PlayCircle size={16} />} loading={syncText.isPending} onClick={() => syncText.mutate()}>
                  同步文本消息
                </Button>
                <Button icon={<FileText size={16} />} loading={syncArchive.isPending} onClick={() => syncArchive.mutate()}>
                  同步会话存档
                </Button>
              </>
            ) : null}
          </Space>
        </div>
        <div className="wecom-step-list">
          {steps.map((step, index) => (
            <div key={step.label} className={`wecom-step-item ${step.done ? "is-done" : ""}`}>
              <span>{step.done ? <CheckCircle2 size={16} /> : index + 1}</span>
              <strong>{step.label}</strong>
              <em>{step.hint}</em>
            </div>
          ))}
        </div>
      </section>

      <div className="wecom-grid">
        <section className="surface-panel wecom-config-panel">
          <div className="section-head">
            <div>
              <div className="section-title">连接企业微信</div>
              <div className="section-subtitle">每个租户独立绑定自己的企业微信主体和会话内容存档配置。</div>
            </div>
            {activeIntegration ? statusTag(activeIntegration.lastSyncStatus) : <Tag>未配置</Tag>}
          </div>
          {!canManage ? (
            <Alert className="mb-4" type="warning" showIcon message="当前账号只能查看授权范围，企业微信配置需企业管理员操作。" />
          ) : null}
          <Form form={integrationForm} layout="vertical" disabled={!canManage} onFinish={(values) => saveIntegration.mutate(values)}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Form.Item name="corpId" label="corpid" rules={[{ required: true, min: 4 }]}>
                <Input placeholder="企业微信企业 ID" />
              </Form.Item>
              <Form.Item name="mode" label="配置模式" rules={[{ required: true }]}>
                <Select options={modeOptions.map((item) => ({ value: item.value, label: item.label }))} />
              </Form.Item>
              <Form.Item name="msgAuditSecretRef" label="会话内容存档 secret" rules={[{ required: true, min: 4 }]}>
                <Input.Password placeholder="建议保存密钥引用或加密后的 secret" />
              </Form.Item>
              <Form.Item name="rsaPrivateKeyRef" label="RSA 私钥或密钥引用" rules={[{ required: true, min: 8 }]}>
                <Input.Password placeholder="建议填写 KMS/密钥管理引用" />
              </Form.Item>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Form.Item name="rsaPublicKeyConfigured" label="RSA 公钥配置状态" valuePropName="checked">
                <Switch checkedChildren="已配置" unCheckedChildren="未配置" />
              </Form.Item>
              <Form.Item name="syncFiles" label="同步文件" valuePropName="checked">
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
              <Form.Item name="retentionDays" label="数据保留周期">
                <InputNumber className="w-full" min={30} max={1095} suffix="天" />
              </Form.Item>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Form.Item name="syncDepartmentIds" label="部门范围">
                <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={departmentOptions} placeholder="可留空，后续逐步收敛" />
              </Form.Item>
              <Form.Item name="syncUserIds" label="成员范围">
                <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={userOptions} placeholder="可留空，使用企业微信存档范围" />
              </Form.Item>
              <Form.Item name="syncChatIds" label="群聊范围">
                <Select mode="tags" allowClear tokenSeparators={[",", "，", "\n"]} placeholder="输入 chat_id，可后续从同步结果确认" />
              </Form.Item>
              <Form.Item name="trustedIpNote" label="可信 IP 提示">
                <Input placeholder="记录已加入企业微信可信 IP 的服务器出口地址" />
              </Form.Item>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Form.Item name="generateLogDrafts" label="生成日志草稿" valuePropName="checked">
                <Switch checkedChildren="生成" unCheckedChildren="不生成" />
              </Form.Item>
              <Form.Item name="generateProjectRisks" label="生成项目风险" valuePropName="checked">
                <Switch checkedChildren="生成" unCheckedChildren="不生成" />
              </Form.Item>
            </div>
            <div className="wecom-mode-list">
              {modeOptions.map((item) => (
                <div key={item.value}>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </div>
              ))}
            </div>
            {canManage ? (
              <Space wrap>
                <Button type="primary" htmlType="submit" icon={<Link2 size={16} />} loading={saveIntegration.isPending}>
                  保存配置
                </Button>
                <Button icon={<ShieldCheck size={16} />} loading={testIntegration.isPending} onClick={() => testIntegration.mutate()}>
                  测试连接
                </Button>
              </Space>
            ) : null}
          </Form>
        </section>

        <section className="surface-panel wecom-summary-panel">
          <div className="section-title">接入结果</div>
          <div className="wecom-metric-grid">
            <div className="metric-card">
              <div className="metric-label">已自动匹配</div>
              <div className="metric-value">{setup?.autoMatched ?? 0}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">待确认成员</div>
              <div className="metric-value">{setup?.needsConfirmation ?? 0}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">已识别群聊</div>
              <div className="metric-value">{setup?.chatCount ?? 0}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">候选草稿</div>
              <div className="metric-value">{setup?.pendingDrafts ?? 0}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">来源文件</div>
              <div className="metric-value">{setup?.fileCount ?? 0}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">项目建议</div>
              <div className="metric-value">{setup?.pendingProjectSuggestions ?? 0}</div>
            </div>
          </div>
          <div className="wecom-compliance-list">
            <div><ShieldCheck size={15} /> 租户独立绑定企业微信主体。</div>
            <div><GitBranch size={15} /> 消息只生成候选，不自动提交日报。</div>
            <div><Users size={15} /> 名称只作辅助，优先使用企业微信 userid。</div>
            <div><AlertTriangle size={15} /> 外部联系人不同意存档时不得同步或分析。</div>
          </div>
        </section>
      </div>

      <section className="surface-panel wecom-table-panel">
        <div className="section-head">
          <div>
            <div className="section-title">成员自动映射</div>
            <div className="section-subtitle">系统优先按企业微信 userid 绑定，其次使用手机号、邮箱、姓名 + 部门辅助匹配。</div>
          </div>
          {canManage ? (
            <Button icon={<Users size={16} />} loading={autoMatch.isPending} onClick={() => autoMatch.mutate()}>
              自动匹配成员
            </Button>
          ) : null}
        </div>
        <Table
          rowKey="id"
          loading={overview.isFetching}
          dataSource={overview.data?.bindings ?? []}
          columns={bindingColumns}
          locale={{ emptyText: <Empty description="暂无成员映射，先保存企业微信配置并执行自动匹配" /> }}
          pagination={{ pageSize: 6 }}
          scroll={{ x: 980 }}
        />
      </section>

      <section className="surface-panel wecom-table-panel">
        <div className="section-head">
          <div>
            <div className="section-title">沟通来源</div>
            <div className="section-subtitle">管理企业微信群与项目、部门或通用来源的关系。</div>
          </div>
          {canManage ? (
            <Button icon={<MessageSquare size={16} />} onClick={() => openSourceModal()}>
              新增来源
            </Button>
          ) : null}
        </div>
        <Table
          rowKey="id"
          loading={overview.isFetching || projects.isFetching}
          dataSource={overview.data?.sources ?? []}
          columns={sourceColumns}
          locale={{ emptyText: <Empty description="暂无沟通来源，先同步或手动新增企业微信群" /> }}
          pagination={{ pageSize: 6 }}
          scroll={{ x: 1080 }}
        />
      </section>

      <section className="surface-panel wecom-table-panel">
        <div className="section-head">
          <div>
            <div className="section-title">沟通记录候选草稿</div>
            <div className="section-subtitle">候选草稿不会自动提交，员工或有权限的管理员确认后才进入正式日报。</div>
          </div>
          <Tooltip title="确认和编辑入口在填报记录页">
            <Tag color="blue">等待用户确认</Tag>
          </Tooltip>
        </div>
        <Table
          rowKey="id"
          loading={overview.isFetching}
          dataSource={overview.data?.drafts ?? []}
          columns={draftColumns}
          locale={{ emptyText: <Empty description="暂无候选草稿，可先同步文本消息" /> }}
          pagination={{ pageSize: 5 }}
          scroll={{ x: 980 }}
        />
      </section>

      <section className="surface-panel wecom-table-panel">
        <div className="section-head">
          <div>
            <div className="section-title">项目群自动建议</div>
            <div className="section-subtitle">根据群名、消息关键词和文件名识别项目群，管理员确认后才会绑定项目。</div>
          </div>
          <Tag color="orange">{overview.data?.setupSummary.pendingProjectSuggestions ?? 0} 项待确认</Tag>
        </div>
        <Table
          rowKey="id"
          loading={overview.isFetching || updateSuggestion.isPending}
          dataSource={overview.data?.projectSuggestions ?? []}
          columns={suggestionColumns}
          locale={{ emptyText: <Empty description="暂无项目群建议，同步会话存档后会自动识别" /> }}
          pagination={{ pageSize: 5 }}
          scroll={{ x: 820 }}
        />
      </section>

      <div className="wecom-grid">
        <section className="surface-panel wecom-table-panel">
          <div className="section-head">
            <div>
              <div className="section-title">来源文件</div>
              <div className="section-subtitle">群文件会先作为来源证据保存，进入日报附件前仍需用户确认。</div>
            </div>
            {overview.data?.setupSummary.failedFileCount ? <Tag color="red">{overview.data.setupSummary.failedFileCount} 个失败</Tag> : <Tag color="green">下载状态正常</Tag>}
          </div>
          <Table
            rowKey="id"
            loading={overview.isFetching}
            dataSource={overview.data?.files ?? []}
            columns={fileColumns}
            locale={{ emptyText: <Empty description="暂无来源文件" /> }}
            pagination={{ pageSize: 5 }}
            scroll={{ x: 980 }}
          />
        </section>

        <section className="surface-panel wecom-table-panel">
          <div className="section-head">
            <div>
              <div className="section-title">客户群存档同意</div>
              <div className="section-subtitle">外部联系人未同意存档时，相关内容不会同步或分析。</div>
            </div>
            {overview.data?.setupSummary.externalConsentIssues ? <Tag color="red">{overview.data.setupSummary.externalConsentIssues} 项需处理</Tag> : <Tag color="green">同意状态正常</Tag>}
          </div>
          <Table
            rowKey="id"
            loading={overview.isFetching}
            dataSource={overview.data?.externalConsents ?? []}
            columns={consentColumns}
            locale={{ emptyText: <Empty description="暂无客户群同意记录" /> }}
            pagination={{ pageSize: 5 }}
          />
        </section>
      </div>

      <section className="surface-panel wecom-guide-panel">
        <div className="wecom-guide-head">
          <BookOpen size={20} className="text-primary" />
          <div>
            <Typography.Title level={4} className="!mb-0">
              如何使用企业微信群作为工作日志来源
            </Typography.Title>
            <Typography.Text className="section-subtitle">给租户管理员的完整使用说明，覆盖前提、合规、配置、员工确认和常见问题。</Typography.Text>
          </div>
        </div>
        <div className="wecom-guide-grid">
          {guideSections.map((section) => (
            <article key={section.title} className="wecom-guide-section">
              <h4>{section.title}</h4>
              {"content" in section && section.content ? <p>{section.content}</p> : null}
              {"bullets" in section && section.bullets ? (
                <ul>
                  {section.bullets.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
              {"steps" in section && section.steps ? (
                <ol>
                  {section.steps.map((item) => <li key={item}>{item}</li>)}
                </ol>
              ) : null}
              {"faqs" in section && section.faqs ? (
                <div className="wecom-faq-list">
                  {section.faqs.map(([question, answer]) => (
                    <div key={question}>
                      <strong>Q：{question}</strong>
                      <span>A：{answer}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <Modal
        title={editingSource ? "编辑沟通来源" : "新增沟通来源"}
        open={sourceModalOpen}
        onCancel={() => {
          setSourceModalOpen(false);
          setEditingSource(null);
        }}
        onOk={() => sourceForm.submit()}
        confirmLoading={saveSource.isPending}
        width={760}
      >
        <Form form={sourceForm} layout="vertical" onFinish={(values) => saveSource.mutate(values)}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Form.Item name="name" label="群聊名称" rules={[{ required: true, min: 2 }]}>
              <Input placeholder="例如：P2026-支付接入项目群" />
            </Form.Item>
            <Form.Item name="chatId" label="企业微信 chat_id" rules={[{ required: true, min: 3 }]}>
              <Input placeholder="从会话存档同步结果获得" />
            </Form.Item>
            <Form.Item name="sourceType" label="来源类型" rules={[{ required: true }]}>
              <Select options={sourceTypeOptions.map((item) => ({ value: item.value, label: item.label }))} />
            </Form.Item>
            <Form.Item name="retentionDays" label="保留周期">
              <InputNumber className="w-full" min={30} max={1095} suffix="天" />
            </Form.Item>
          </div>
          <Form.Item name="projectIds" label="绑定项目">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={projectOptions} loading={projects.isFetching} placeholder="项目群建议至少选择一个项目" />
          </Form.Item>
          <Form.Item name="departmentIds" label="绑定部门">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={departmentOptions} placeholder="部门群可绑定一个或多个部门" />
          </Form.Item>
          <Form.Item name="memberScopeUserIds" label="同步成员范围">
            <Select mode="multiple" allowClear showSearch optionFilterProp="label" options={userOptions} placeholder="可留空，使用来源默认范围" />
          </Form.Item>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Form.Item name="generateLogDrafts" label="生成日志草稿" valuePropName="checked">
              <Switch checkedChildren="生成" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item name="generateProjectRisks" label="生成项目风险" valuePropName="checked">
              <Switch checkedChildren="生成" unCheckedChildren="关闭" />
            </Form.Item>
            <Form.Item name="syncFiles" label="同步文件" valuePropName="checked">
              <Switch checkedChildren="同步" unCheckedChildren="关闭" />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
