"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, DatePicker, Empty, Form, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { Dayjs } from "dayjs";
import { Edit2, Plus, RotateCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasAnyRole, useAuthStore } from "@/lib/auth-store";
import { OrgUser, Project, ProjectStatus } from "@/lib/types";

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

export default function ProjectsPage() {
  const user = useAuthStore((state) => state.user);
  const canManage = hasAnyRole(user, ["SUPER_ADMIN", "COMPANY_ADMIN"]);
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProjectForm>();
  const [editing, setEditing] = useState<Project | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "ALL">("ALL");

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiFetch<Project[]>("/projects"),
    enabled: canManage
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
    onSuccess: () => {
      message.success("项目已保存");
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

  const columns: ColumnsType<Project> = [
    {
      title: "项目",
      render: (_, record) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{record.name}</span>
            {record.code ? <Tag>{record.code}</Tag> : null}
            <Tag color={statusColor(record.status)}>{statusLabel(record.status)}</Tag>
          </div>
          {record.description ? <div className="mt-1 max-w-3xl text-sm text-muted">{record.description}</div> : null}
        </div>
      )
    },
    {
      title: "负责人",
      width: 160,
      render: (_, record) => record.owner?.name ?? "未设置"
    },
    {
      title: "健康度",
      width: 120,
      render: (_, record) => {
        const health = projectHealth(record);
        return <Tag color={health.color}>{health.label}</Tag>;
      }
    },
    {
      title: "周期",
      width: 220,
      render: (_, record) => `${dateText(record.startDate)} 至 ${dateText(record.endDate)}`
    },
    {
      title: "更新",
      dataIndex: "updatedAt",
      width: 140,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD")
    },
    {
      title: "操作",
      width: 140,
      render: (_, record) => (
        <Space>
          <Button icon={<Edit2 size={15} />} onClick={() => openEdit(record)} />
          <Popconfirm title="确认归档该项目？历史日报仍保留项目归属。" onConfirm={() => deleteProject.mutate(record.id)}>
            <Button danger icon={<Trash2 size={15} />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  if (!canManage) {
    return <Alert type="warning" showIcon message="只有企业管理员可以维护项目基本信息。" />;
  }

  return (
    <div className="page-stack">
      <div className="page-header">
        <div>
          <Typography.Title level={3} className="page-title">
            项目管理
          </Typography.Title>
          <Typography.Text className="page-subtitle">维护轻量项目主数据，日报和未来计划可关联到项目，便于日历与 AI 汇报按项目理解上下文。</Typography.Text>
        </div>
        <Button type="primary" icon={<Plus size={16} />} onClick={openCreate}>
          新增项目
        </Button>
      </div>

      <div className="toolbar-panel flex flex-wrap items-center justify-between gap-3">
        <Select
          value={statusFilter}
          style={{ width: 132 }}
          onChange={setStatusFilter}
          options={[{ value: "ALL", label: "全部状态" }, ...statusOptions.map((item) => ({ value: item.value, label: item.label }))]}
        />
        <Button icon={<RotateCw size={16} />} onClick={() => projects.refetch()} loading={projects.isFetching}>
          刷新
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={projects.isFetching}
        dataSource={filteredProjects}
        columns={columns}
        locale={{ emptyText: <Empty description="暂无项目" /> }}
        pagination={{ pageSize: 8 }}
      />

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
    </div>
  );
}
