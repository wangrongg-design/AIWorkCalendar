"use client";

import { Button, Modal, Space, Typography, message } from "antd";
import { Download, ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import { MouseEvent, useEffect, useState } from "react";
import { apiDownload } from "@/lib/api";
import { WorkLogAttachment } from "@/lib/types";

type AttachmentPreview = {
  attachment: WorkLogAttachment;
  filename: string;
  url: string;
  mode: "image" | "frame" | "file";
};

function isFramePreviewable(mimeType: string) {
  return mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType === "application/json";
}

function fileSizeText(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function triggerDownload(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function WorkLogAttachmentViewer({
  workLogId,
  attachments
}: {
  workLogId: string;
  attachments?: WorkLogAttachment[];
}) {
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview?.url) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [preview?.url]);

  if (!attachments?.length) {
    return <Typography.Text className="text-sm text-muted">无附件</Typography.Text>;
  }

  const fetchAttachment = async (attachment: WorkLogAttachment) => {
    return apiDownload(`/work-logs/${workLogId}/attachments/${attachment.id}/download`);
  };

  const openPreview = async (attachment: WorkLogAttachment) => {
    setLoadingId(attachment.id);
    try {
      const download = await fetchAttachment(attachment);
      const url = URL.createObjectURL(download.blob);
      const mode = attachment.mimeType.startsWith("image/")
        ? "image"
        : isFramePreviewable(attachment.mimeType)
          ? "frame"
          : "file";
      setPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { attachment, filename: download.filename || attachment.fileName, url, mode };
      });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "附件预览失败");
    } finally {
      setLoadingId(null);
    }
  };

  const downloadAttachment = async (event: MouseEvent, attachment: WorkLogAttachment) => {
    event.stopPropagation();
    setLoadingId(attachment.id);
    try {
      const download = await fetchAttachment(attachment);
      const url = URL.createObjectURL(download.blob);
      triggerDownload(url, download.filename || attachment.fileName);
      window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "附件下载失败");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <>
      <div className="attachment-viewer-grid">
        {attachments.map((attachment) => {
          const isImage = attachment.mimeType.startsWith("image/");
          return (
            <button
              key={attachment.id}
              type="button"
              className="attachment-viewer-item"
              onClick={() => openPreview(attachment)}
            >
              <span className={`attachment-viewer-icon ${isImage ? "is-image" : ""}`}>
                {isImage ? <ImageIcon size={18} /> : <FileText size={18} />}
              </span>
              <span className="attachment-viewer-main">
                <span className="attachment-viewer-name">{attachment.fileName}</span>
                <span className="attachment-viewer-meta">
                  {isImage ? "图片" : "文件"} · {fileSizeText(attachment.fileSize)}
                </span>
              </span>
              <Button
                size="small"
                type="text"
                icon={<Download size={15} />}
                loading={loadingId === attachment.id}
                onClick={(event) => downloadAttachment(event, attachment)}
              />
            </button>
          );
        })}
      </div>

      <Modal
        title={preview?.attachment.fileName ?? "附件预览"}
        open={Boolean(preview)}
        onCancel={() => setPreview(null)}
        footer={
          preview ? (
            <Space>
              {preview.mode !== "file" ? (
                <Button icon={<ExternalLink size={15} />} href={preview.url} target="_blank">
                  新窗口打开
                </Button>
              ) : null}
              <Button type="primary" icon={<Download size={15} />} onClick={() => triggerDownload(preview.url, preview.filename)}>
                下载
              </Button>
            </Space>
          ) : null
        }
        width={preview?.mode === "file" ? 560 : 920}
      >
        {preview?.mode === "image" ? (
          <img src={preview.url} alt={preview.attachment.fileName} className="attachment-preview-image" />
        ) : preview?.mode === "frame" ? (
          <iframe title={preview.attachment.fileName} src={preview.url} className="attachment-preview-frame" />
        ) : preview ? (
          <div className="attachment-preview-file">
            <FileText size={42} />
            <div className="mt-3 text-base font-medium text-ink">{preview.attachment.fileName}</div>
            <div className="mt-1 text-sm text-muted">
              {preview.attachment.mimeType} · {fileSizeText(preview.attachment.fileSize)}
            </div>
            <div className="mt-4 text-sm text-muted">此文件类型暂不支持在线预览，请下载后查看。</div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
