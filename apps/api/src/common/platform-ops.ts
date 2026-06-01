import { RoleCode } from "@prisma/client";
import type { CurrentUser } from "./types/current-user";

export const PLATFORM_OPS_USER_ID = "platform-ops";
export const PLATFORM_OPS_TENANT_ID = "platform";
export const PLATFORM_OPS_TENANT_NAME = "北京七数智联科技有限公司";
export const PLATFORM_OPS_TENANT_CODE = "PLATFORM";

export function buildPlatformOpsCurrentUser(): CurrentUser {
  return {
    id: PLATFORM_OPS_USER_ID,
    tenantId: PLATFORM_OPS_TENANT_ID,
    email: null,
    phone: null,
    name: "平台超级管理员",
    departmentId: null,
    roles: [RoleCode.SUPER_ADMIN],
    isPlatformOps: true
  };
}

export function buildPlatformOpsAuthUser() {
  return {
    ...buildPlatformOpsCurrentUser(),
    tenantName: PLATFORM_OPS_TENANT_NAME,
    tenantCode: PLATFORM_OPS_TENANT_CODE,
    tenantLogoUrl: null,
    departmentName: null,
    requiresWorkReport: false
  };
}

export function isPlatformOpsTokenPayload(payload: { sub?: string; tenantId?: string; scope?: string }) {
  return payload.scope === "ops" && payload.sub === PLATFORM_OPS_USER_ID && payload.tenantId === PLATFORM_OPS_TENANT_ID;
}
