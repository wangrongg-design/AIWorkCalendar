export const demoUnifiedSocialCreditCode = "91110105MA01A1B2X3";

export const unifiedSocialCreditCodePattern = /^[0-9A-HJ-NPQRTUWXY]{18}$/;

export function normalizeUnifiedSocialCreditCode(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

export const unifiedSocialCreditCodeMessage = "请输入 18 位营业执照统一社会信用代码";
