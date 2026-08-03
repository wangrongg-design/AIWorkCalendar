import { ForbiddenException, Injectable } from "@nestjs/common";
import { LogViewScope, Prisma, RoleCode } from "@prisma/client";
import { CurrentUser } from "../types/current-user";

export type Scope = "self" | "department" | "company";

@Injectable()
export class AccessService {
  isSuperAdmin(user: CurrentUser) {
    return user.roles.includes(RoleCode.SUPER_ADMIN);
  }

  isCompanyAdmin(user: CurrentUser) {
    if (user.isPlatformOps) return false;
    return user.roles.includes(RoleCode.COMPANY_ADMIN) || this.isSuperAdmin(user);
  }

  isDepartmentManager(user: CurrentUser) {
    return user.roles.includes(RoleCode.DEPARTMENT_MANAGER);
  }

  resolveRoleScope(user: CurrentUser, requestedScope?: Scope, departmentId?: string | null): { scope: Scope; departmentId?: string } {
    if (this.isCompanyAdmin(user)) {
      return {
        scope: requestedScope ?? "company",
        departmentId: departmentId ?? undefined
      };
    }
    if (this.isDepartmentManager(user)) {
      if (requestedScope === "company") {
        throw new ForbiddenException("Department managers cannot access company scope");
      }
      return {
        scope: requestedScope === "self" ? "self" : "department",
        departmentId: user.departmentId ?? undefined
      };
    }
    return { scope: "self" };
  }

  resolveScope(user: CurrentUser, requestedScope?: Scope, departmentId?: string | null): { scope: Scope; departmentId?: string } {
    if (user.logViewScope === LogViewScope.COMPANY) {
      if (requestedScope === "self") {
        return { scope: "self" };
      }
      if (requestedScope === "department") {
        return {
          scope: "department",
          departmentId: departmentId ?? user.departmentId ?? undefined
        };
      }
      return {
        scope: "company",
        departmentId: departmentId ?? undefined
      };
    }
    if (user.logViewScope === LogViewScope.DEPARTMENT) {
      if (requestedScope === "company") {
        throw new ForbiddenException("This user cannot access company scope");
      }
      return {
        scope: requestedScope === "self" ? "self" : "department",
        departmentId: user.departmentId ?? undefined
      };
    }
    if (user.logViewScope === LogViewScope.SELF) {
      return { scope: "self" };
    }
    return this.resolveRoleScope(user, requestedScope, departmentId);
  }

  private buildUserWhere(user: CurrentUser, resolved: { scope: Scope; departmentId?: string }): Prisma.UserWhereInput {
    const base: Prisma.UserWhereInput = {
      tenantId: user.tenantId,
      isActive: true,
      deletedAt: null
    };
    if (resolved.scope === "self") {
      return { ...base, id: user.id };
    }
    if (resolved.scope === "department") {
      if (!resolved.departmentId) {
        return { ...base, id: "__no_department__" };
      }
      return { ...base, departmentId: resolved.departmentId };
    }
    if (resolved.departmentId) {
      return { ...base, departmentId: resolved.departmentId };
    }
    return base;
  }

  userWhere(user: CurrentUser, requestedScope?: Scope, departmentId?: string | null): Prisma.UserWhereInput {
    return this.buildUserWhere(user, this.resolveScope(user, requestedScope, departmentId));
  }

  roleUserWhere(user: CurrentUser, requestedScope?: Scope, departmentId?: string | null): Prisma.UserWhereInput {
    return this.buildUserWhere(user, this.resolveRoleScope(user, requestedScope, departmentId));
  }

  workLogWhere(user: CurrentUser, requestedScope?: Scope, departmentId?: string | null): Prisma.WorkLogWhereInput {
    const resolved = this.resolveScope(user, requestedScope, departmentId);
    const base: Prisma.WorkLogWhereInput = {
      tenantId: user.tenantId,
      deletedAt: null
    };
    if (resolved.scope === "self") {
      return { ...base, userId: user.id };
    }
    if (resolved.scope === "department") {
      if (!resolved.departmentId) {
        return { ...base, userId: "__no_department__" };
      }
      return { ...base, user: { departmentId: resolved.departmentId } };
    }
    if (resolved.departmentId) {
      return { ...base, user: { departmentId: resolved.departmentId } };
    }
    return base;
  }

  assertCanManageOrg(user: CurrentUser) {
    if (!this.isCompanyAdmin(user)) {
      throw new ForbiddenException("Only company admins can manage organization");
    }
  }

  assertCanAccessUser(user: CurrentUser, target: { id: string; departmentId: string | null }) {
    if (this.isCompanyAdmin(user) || target.id === user.id) {
      return;
    }
    const resolved = this.resolveScope(user);
    if (resolved.scope === "company") {
      return;
    }
    if (resolved.scope === "department" && target.departmentId && target.departmentId === resolved.departmentId) {
      return;
    }
    throw new ForbiddenException("Cannot access this user");
  }

  assertCanAccessUserByRole(user: CurrentUser, target: { id: string; departmentId: string | null }) {
    if (this.isCompanyAdmin(user) || target.id === user.id) {
      return;
    }
    const resolved = this.resolveRoleScope(user);
    if (resolved.scope === "department" && target.departmentId && target.departmentId === resolved.departmentId) {
      return;
    }
    throw new ForbiddenException("Cannot access this user");
  }
}
