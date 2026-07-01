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

function compactDisplayText(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value?: string | null) {
  return compactDisplayText(value)
    .toLowerCase()
    .replace(/[，。！？、,.!?；;：:\-—_'"“”‘’（）()【】\[\]《》<>/\s]/g, "");
}

function textOverlapScore(source: string, target: string) {
  const sourceChars = Array.from(source);
  if (!sourceChars.length) return 0;
  const targetChars = new Set(Array.from(target));
  const hits = sourceChars.filter((char) => targetChars.has(char)).length;
  return hits / sourceChars.length;
}

function isCompactResultPhrase(value: string, reference: string) {
  const text = compactDisplayText(value);
  const normalizedValue = normalizeComparableText(value);
  const normalizedReference = normalizeComparableText(reference);
  if (!normalizedValue || !normalizedReference) return false;
  const lengthRatio = normalizedValue.length / normalizedReference.length;
  return /^(完成|提交|确认|交付|修复|整理|梳理|输出|建立|上线|推进|解决|优化|复盘|评审|核对|补齐|同步|制定|更新|发布|测试|联调|归档)/.test(text) && lengthRatio <= 0.72;
}

function isSimilarText(a?: string | null, b?: string | null) {
  const first = normalizeComparableText(a);
  const second = normalizeComparableText(b);
  if (!first || !second) return false;
  if (first === second) return true;
  const shorter = first.length <= second.length ? first : second;
  const longer = first.length > second.length ? first : second;
  const lengthRatio = shorter.length / longer.length;
  if (shorter.length >= 8 && longer.includes(shorter) && lengthRatio >= 0.72) return true;
  return lengthRatio >= 0.82 && textOverlapScore(shorter, longer) >= 0.84;
}

function formatDisplayHours(value: WorkLog["hours"]) {
  const hours = Number(value) || 0;
  return `${hours.toFixed(1).replace(/\.0$/, "")} 小时`;
}

function fallbackAnalysisSummary(record: WorkLog, projectName: string) {
  const detailKind = workLogKindLabel(record);
  const title = compactDisplayText(record.title);
  const projectText = projectName && projectName !== "未关联" ? `，关联项目「${projectName}」` : "";
  if (!title) return "该记录内容较短，暂未形成更多分析结论。";
  return `本次${detailKind === "工作计划" ? "计划" : "记录"}围绕「${title}」展开${projectText}，耗时 ${formatDisplayHours(record.hours)}。`;
}

function displayAnalysisSummary(record: WorkLog, projectName: string) {
  const summary = compactDisplayText(record.aiAnalysis?.summary);
  if (summary && !isSimilarText(summary, record.content)) return summary;
  return fallbackAnalysisSummary(record, projectName);
}

function uniqueTextList(items?: string[]) {
  const seen = new Set<string>();
  return (items ?? [])
    .map(compactDisplayText)
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeComparableText(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function displayAchievements(record: WorkLog, summary: string) {
  return uniqueTextList(record.aiAnalysis?.achievements).filter((item) => {
    if (isCompactResultPhrase(item, record.content)) return true;
    if (isSimilarText(item, record.content) || isSimilarText(item, summary)) return false;
    return true;
  });
}

function displayTags(record: WorkLog) {
  const mutedTags = new Set(["自动分析", "本地分析", "常规工时"]);
  return uniqueTextList([...(record.aiAnalysis?.keywords ?? []), ...(record.aiAnalysis?.tags ?? [])]).filter((item) => !mutedTags.has(item));
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
  const userName = record.user?.name;
  const canNavigate = Boolean(navigation && navigation.total > 1);
  const showStatus = currentUserId ? record.userId === currentUserId || record.status !== "SUBMITTED" : true;
  return (
    <div className="work-log-detail-titlebar">
      <div className="work-log-detail-title-copy">
        <div className="work-log-detail-title-main">
          {dayjs(record.date).format("YYYY-MM-DD")} · {detailKind}
          {userName ? <span> · {userName}</span> : null}
        </div>
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
  emptyText,
  hideWhenEmpty = false
}: {
  title: string;
  tone: AnalysisTone;
  icon: ReactNode;
  items?: string[];
  emptyText: string;
  hideWhenEmpty?: boolean;
}) {
  const safeItems = items?.filter(Boolean) ?? [];
  if (!safeItems.length && hideWhenEmpty) return null;
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
  const analysisSummary = record.aiAnalysis ? displayAnalysisSummary(record, projectName) : "";
  const achievements = record.aiAnalysis ? displayAchievements(record, analysisSummary) : [];
  const risks = uniqueTextList(record.aiAnalysis?.risks);
  const blockers = uniqueTextList(record.aiAnalysis?.blockers);
  const tags = displayTags(record);

  return (
    <div className="work-log-detail-shell">
      <div className="work-log-info-strip">
        <div className="work-log-info-item">
          <span>项目</span>
          <strong>{projectName}</strong>
        </div>
        <div className="work-log-info-item">
          <span>工时</span>
          <strong>{Number(record.hours).toFixed(1)}h</strong>
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

      <DetailSection title="原始记录">
        <div className="work-log-detail-content">{record.content}</div>
      </DetailSection>

      {record.aiAnalysis ? (
        <DetailSection title="AI 分析" icon={<Bot size={16} />}>
          <div className="work-log-analysis-summary-box">
            <span>摘要</span>
            <p className="work-log-analysis-summary">{analysisSummary}</p>
          </div>
          <div className="work-log-analysis-subhead">结构化结果</div>
          <div className="work-log-analysis-grid">
            <AnalysisList
              title="成果"
              tone="success"
              icon={<CheckCircle2 size={15} />}
              items={achievements}
              emptyText="暂无明确成果"
              hideWhenEmpty
            />
            <AnalysisList
              title="风险"
              tone="risk"
              icon={<AlertTriangle size={15} />}
              items={risks}
              emptyText="暂无风险"
            />
            <AnalysisList
              title="阻塞"
              tone="blocker"
              icon={<Ban size={15} />}
              items={blockers}
              emptyText="暂无阻塞"
            />
          </div>
          {tags.length ? (
            <div className="work-log-analysis-tag-section">
              <span>标签</span>
              <div className="work-log-analysis-tags">
                {tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
              </div>
            </div>
          ) : null}
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
