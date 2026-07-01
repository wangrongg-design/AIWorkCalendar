"use client";

import { Button, Tag } from "antd";
import dayjs from "dayjs";
import { AlertTriangle, Ban, Bot, CheckCircle2, ChevronLeft, ChevronRight, Clock3, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { WorkLog } from "@/lib/types";
import { WorkLogAttachmentViewer } from "./WorkLogAttachmentViewer";

type AnalysisTone = "success" | "risk" | "blocker";

type WorkLogDetailViewProps = {
  record: WorkLog;
  projectNameFallback?: string | null;
  showTimeInfo?: boolean;
};

type WorkLogDetailNavigation = {
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
};

function dateTimeText(value?: string | null) {
  if (!value) return "-";
  const date = dayjs(value);
  return date.isValid() ? date.format("YYYY-MM-DD HH:mm") : "-";
}

function workLogTimeInfo(record: WorkLog) {
  if (record.submittedAt && dayjs(record.submittedAt).isValid()) {
    return { label: "提交时间", value: dateTimeText(record.submittedAt) };
  }
  if (record.createdAt && dayjs(record.createdAt).isValid()) {
    return { label: record.status === "DRAFT" ? "草稿创建" : "创建时间", value: dateTimeText(record.createdAt) };
  }
  return { label: "时间", value: "-" };
}

export function workLogDetailStatus(record: WorkLog) {
  if (record.status === "SUBMITTED" && !record.aiAnalysis) {
    return { label: "生成中", color: "orange" as const };
  }
  if (record.status === "SUBMITTED") {
    return { label: "已提交", color: "green" as const };
  }
  return { label: "草稿", color: "default" as const };
}

function workLogKindLabel(record: WorkLog) {
  return (record.kind ?? "DAILY") === "PLAN" ? "工作计划" : "工作日报";
}

export function WorkLogDetailTitle({
  record,
  currentUserId,
  navigation
}: {
  record: WorkLog;
  currentUserId?: string | null;
  readOnly?: boolean;
  navigation?: WorkLogDetailNavigation | null;
}) {
  const status = workLogDetailStatus(record);
  const detailKind = workLogKindLabel(record);
  const canNavigate = Boolean(navigation && navigation.total > 1);
  const showStatus = currentUserId ? record.userId === currentUserId || record.status !== "SUBMITTED" : true;
  return (
    <div className="work-log-detail-titlebar">
      <div className="work-log-detail-title-copy">
        <div className="work-log-detail-title-main">{dayjs(record.date).format("YYYY-MM-DD")} · {detailKind}</div>
        <div className="work-log-detail-title-sub">{record.title}</div>
      </div>
      <div className="work-log-detail-title-actions">
        {showStatus ? (
          <div className="work-log-detail-title-tags">
            <Tag color={status.color}>{status.label}</Tag>
          </div>
        ) : null}
        {canNavigate ? (
          <div className="work-log-detail-pager" aria-label={`切换该成员的其他${detailKind}`}>
            <Button
              type="text"
              shape="circle"
              icon={<ChevronLeft size={16} />}
              aria-label={`上一条${detailKind}`}
              disabled={navigation?.previousDisabled}
              onClick={navigation?.onPrevious}
            />
            <span>
              第 {navigation?.current}/{navigation?.total} 条
            </span>
            <Button
              type="text"
              shape="circle"
              icon={<ChevronRight size={16} />}
              aria-label={`下一条${detailKind}`}
              disabled={navigation?.nextDisabled}
              onClick={navigation?.onNext}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="work-log-detail-section">
      <div className="work-log-detail-section-head">
        {icon ? <span className="work-log-detail-section-icon">{icon}</span> : null}
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  );
}

function AnalysisList({
  title,
  tone,
  icon,
  items,
  emptyText
}: {
  title: string;
  tone: AnalysisTone;
  icon: ReactNode;
  items?: string[];
  emptyText: string;
}) {
  const safeItems = items?.filter(Boolean) ?? [];
  return (
    <section className={`work-log-analysis-card is-${tone}${safeItems.length ? "" : " is-empty"}`}>
      <div className="work-log-analysis-card-title">
        {icon}
        <span>{title}</span>
      </div>
      {safeItems.length ? (
        <ul className="work-log-analysis-list">
          {safeItems.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <div className="work-log-analysis-empty">{emptyText}</div>
      )}
    </section>
  );
}

export function WorkLogDetailView({ record, projectNameFallback, showTimeInfo = true }: WorkLogDetailViewProps) {
  const timeInfo = workLogTimeInfo(record);
  const status = workLogDetailStatus(record);
  const projectName = record.project?.name ?? projectNameFallback ?? "未关联";
  const detailKind = workLogKindLabel(record);

  return (
    <div className="work-log-detail-shell">
      <div className="work-log-info-strip">
        <div className="work-log-info-item">
          <span>人员</span>
          <strong>{record.user?.name ?? "-"}</strong>
        </div>
        <div className="work-log-info-item">
          <span>项目</span>
          <strong>{projectName}</strong>
        </div>
        <div className="work-log-info-item">
          <span>工时</span>
          <strong>{Number(record.hours).toFixed(1)}h</strong>
        </div>
        <div className="work-log-info-item">
          <span>类型</span>
          <strong>{detailKind}</strong>
        </div>
        {showTimeInfo ? (
          <div className="work-log-info-item">
            <span>{timeInfo.label}</span>
            <strong>{timeInfo.value}</strong>
          </div>
        ) : (
          <div className="work-log-info-item">
            <span>状态</span>
            <strong>{status.label}</strong>
          </div>
        )}
      </div>

      <DetailSection title="工作内容">
        <div className="work-log-detail-content">{record.content}</div>
      </DetailSection>

      {record.aiAnalysis ? (
        <DetailSection title="分析结果" icon={<Bot size={16} />}>
          <p className="work-log-analysis-summary">{record.aiAnalysis.summary}</p>
          <div className="work-log-analysis-grid">
            <AnalysisList
              title="成果"
              tone="success"
              icon={<CheckCircle2 size={15} />}
              items={record.aiAnalysis.achievements}
              emptyText="暂无明确成果"
            />
            <AnalysisList
              title="风险"
              tone="risk"
              icon={<AlertTriangle size={15} />}
              items={record.aiAnalysis.risks}
              emptyText="暂无风险"
            />
            <AnalysisList
              title="阻塞"
              tone="blocker"
              icon={<Ban size={15} />}
              items={record.aiAnalysis.blockers}
              emptyText="暂无阻塞"
            />
          </div>
          <div className="work-log-analysis-tags">
            <Tag color="blue">{record.aiAnalysis.category}</Tag>
            {record.aiAnalysis.tags?.map((tag) => <Tag key={tag}>{tag}</Tag>)}
          </div>
        </DetailSection>
      ) : record.status === "SUBMITTED" ? (
        <DetailSection title="分析生成中" icon={<Clock3 size={16} />}>
          <div className="work-log-analysis-pending" role="status" aria-live="polite">
            <span className="quickfill-draft-spinner" />
            <div>
              <strong>正在分析这条填报</strong>
              <p>系统已提交分析任务，真实模型可能需要几十秒；稍后刷新或返回列表查看结果。</p>
            </div>
          </div>
        </DetailSection>
      ) : null}

      {record.attachments?.length ? (
        <DetailSection title="附件">
          <WorkLogAttachmentViewer workLogId={record.id} attachments={record.attachments} compact />
        </DetailSection>
      ) : null}

      {record.sourceLinks?.length ? (
        <DetailSection title="沟通来源证据" icon={<MessageSquare size={16} />}>
          <div className="work-log-source-list">
            {record.sourceLinks.map((link) => (
              <div key={link.id} className="work-log-source-item">
                <strong>{link.source?.name ?? "企业微信群"}</strong>
                <span>{link.evidenceSummary ?? link.message?.content ?? link.file?.aiSummary ?? link.file?.fileName ?? "来源消息已记录。"}</span>
                <div className="work-log-source-meta">
                  {link.file ? <Tag color="cyan">文件：{link.file.fileName}</Tag> : null}
                  {link.message?.sentAt ? <em>发送时间：{dateTimeText(link.message.sentAt)}</em> : null}
                </div>
              </div>
            ))}
          </div>
        </DetailSection>
      ) : null}
    </div>
  );
}
