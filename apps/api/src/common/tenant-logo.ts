import { BadRequestException } from "@nestjs/common";

export const tenantLogoSpec = {
  mimeType: "image/png",
  width: 620,
  height: 220,
  maxBytes: 256 * 1024
};

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseLogoDataUrl(value: string) {
  const match = value.match(/^data:(image\/png);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    throw new BadRequestException("企业 Logo 仅支持 PNG data URL");
  }
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2].replace(/\s/g, ""), "base64")
  };
}

function assertPngSize(buffer: Buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new BadRequestException("企业 Logo 文件不是有效 PNG");
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== tenantLogoSpec.width || height !== tenantLogoSpec.height) {
    throw new BadRequestException(`企业 Logo 尺寸必须为 ${tenantLogoSpec.width} x ${tenantLogoSpec.height}px`);
  }
}

export function normalizeTenantLogoUrl(value?: string | null) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const parsed = parseLogoDataUrl(trimmed);
  if (parsed.mimeType !== tenantLogoSpec.mimeType) {
    throw new BadRequestException("企业 Logo 仅支持 PNG 格式");
  }
  if (parsed.buffer.byteLength > tenantLogoSpec.maxBytes) {
    throw new BadRequestException("企业 Logo 不能超过 256KB");
  }
  assertPngSize(parsed.buffer);
  return trimmed;
}
