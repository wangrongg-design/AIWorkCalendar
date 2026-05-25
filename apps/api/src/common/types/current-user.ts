import { RoleCode } from "@prisma/client";

export type CurrentUser = {
  id: string;
  tenantId: string;
  email: string | null;
  phone?: string | null;
  name: string;
  departmentId: string | null;
  roles: RoleCode[];
};
