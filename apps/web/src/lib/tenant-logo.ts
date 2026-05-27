export const tenantLogoSpec = {
  mimeType: "image/png",
  width: 620,
  height: 220,
  maxBytes: 256 * 1024,
  helpText: "PNG 格式，620 x 220px，最大 256KB。建议使用透明背景。"
};

export type TenantLogoValidationResult = {
  dataUrl: string;
  width: number;
  height: number;
  size: number;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Logo 读取失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Logo 图片无法解析"));
    image.src = dataUrl;
  });
}

export async function validateTenantLogoFile(file: File): Promise<TenantLogoValidationResult> {
  if (file.type !== tenantLogoSpec.mimeType) {
    throw new Error("企业 Logo 仅支持 PNG 格式");
  }
  if (file.size > tenantLogoSpec.maxBytes) {
    throw new Error("企业 Logo 不能超过 256KB");
  }
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  if (image.naturalWidth !== tenantLogoSpec.width || image.naturalHeight !== tenantLogoSpec.height) {
    throw new Error(`企业 Logo 尺寸必须为 ${tenantLogoSpec.width} x ${tenantLogoSpec.height}px`);
  }
  return {
    dataUrl,
    width: image.naturalWidth,
    height: image.naturalHeight,
    size: file.size
  };
}
