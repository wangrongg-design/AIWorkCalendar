import { RoleCode } from "@prisma/client";

export type CurrentUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  departmentId: string | null;
  roles: RoleCode[];
};

