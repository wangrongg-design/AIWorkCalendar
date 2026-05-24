export const ROLE_CODES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  COMPANY_ADMIN: "COMPANY_ADMIN",
  DEPARTMENT_MANAGER: "DEPARTMENT_MANAGER",
  EMPLOYEE: "EMPLOYEE"
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const WORK_LOG_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED"
} as const;

export type WorkLogStatus = (typeof WORK_LOG_STATUS)[keyof typeof WORK_LOG_STATUS];

export const REPORT_TYPES = {
  PERSONAL_DAILY: "PERSONAL_DAILY",
  PERSONAL_WEEKLY: "PERSONAL_WEEKLY",
  DEPARTMENT_DAILY: "DEPARTMENT_DAILY",
  DEPARTMENT_WEEKLY: "DEPARTMENT_WEEKLY"
} as const;

export type ReportType = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];

