export const unifiedSocialCreditCodePattern = /^[0-9A-HJ-NPQRTUWXY]{18}$/;

export function normalizeUnifiedSocialCreditCode(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

export function normalizeOptionalUnifiedSocialCreditCode(value?: string | null) {
  const normalized = normalizeUnifiedSocialCreditCode(value);
  return normalized || undefined;
}
