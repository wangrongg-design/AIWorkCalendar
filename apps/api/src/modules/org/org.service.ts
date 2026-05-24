import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { RoleCode, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { SubscriptionService } from "../../common/subscription/subscription.service";
import { CurrentUser } from "../../common/types/current-user";
import { CreateDepartmentDto, UpdateDepartmentDto } from "./dto/department.dto";
import { CreateTenantDto } from "./dto/tenant.dto";
import { CreateUserDto, UpdateUserDto } from "./dto/user.dto";

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly subscriptions: SubscriptionService,
    private readonly audit: AuditService
  ) {}

  async getOrg(user: CurrentUser) {
    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: { id: user.tenantId, deletedAt: null }
    });
    const departments = await this.prisma.department.findMany({
      where: { tenantId: user.tenantId, deletedAt: null },
      orderBy: [{ name: "asc" }]
    });
    const users = await this.prisma.user.findMany({
      where: this.access.userWhere(user, this.access.isCompanyAdmin(user) ? "company" : undefined),
      include: {
        department: true,
        roles: { where: { deletedAt: null }, include: { role: true } }
      },
      orderBy: [{ createdAt: "asc" }]
    });
    const subscription = await this.subscriptions.getSubscriptionSummary(user.tenantId);
    return {
      tenant,
      subscription,
      departments,
      users: users.map((item) => ({
        id: item.id,
        email: item.email,
        name: item.name,
        departmentId: item.departmentId,
        departmentName: item.department?.name ?? null,
        isActive: item.isActive,
        roles: item.roles.map((role) => role.role.code),
        createdAt: item.createdAt
      }))
    };
  }

  async createTenant(user: CurrentUser, dto: CreateTenantDto) {
    if (!this.access.isSuperAdmin(user)) {
      throw new BadRequestException("Only super admin can create tenants");
    }
    const existing = await this.prisma.tenant.findUnique({ where: { code: dto.code } });
    if (existing && !existing.deletedAt) {
      throw new BadRequestException("Tenant code already exists");
    }

    const passwordHash = await bcrypt.hash(dto.adminPassword ?? "Passw0rd!", 10);
    const roleDefs: Array<{ code: RoleCode; name: string }> = [
      { code: RoleCode.SUPER_ADMIN, name: "超级管理员" },
      { code: RoleCode.COMPANY_ADMIN, name: "企业管理员" },
      { code: RoleCode.DEPARTMENT_MANAGER, name: "部门经理" },
      { code: RoleCode.EMPLOYEE, name: "普通员工" }
    ];

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.upsert({
        where: { code: dto.code },
        update: { name: dto.name, deletedAt: null },
        create: { name: dto.name, code: dto.code }
      });
      const periodEnd = new Date();
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      await tx.subscription.upsert({
        where: { tenantId: tenant.id },
        update: { deletedAt: null },
        create: {
          tenantId: tenant.id,
          plan: SubscriptionPlan.TRIAL,
          status: SubscriptionStatus.TRIALING,
          seatLimit: 3,
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          trialEndsAt: periodEnd,
          provider: "manual"
        }
      });
      const roles = new Map<RoleCode, string>();
      for (const roleDef of roleDefs) {
        const role = await tx.role.upsert({
          where: { tenantId_code: { tenantId: tenant.id, code: roleDef.code } },
          update: { name: roleDef.name, deletedAt: null },
          create: { tenantId: tenant.id, code: roleDef.code, name: roleDef.name }
        });
        roles.set(roleDef.code, role.id);
      }
      const admin = await tx.user.upsert({
        where: { tenantId_email: { tenantId: tenant.id, email: dto.adminEmail } },
        update: {
          name: dto.adminName,
          passwordHash,
          isActive: true,
          deletedAt: null
        },
        create: {
          tenantId: tenant.id,
          email: dto.adminEmail,
          name: dto.adminName,
          passwordHash
        }
      });
      const roleId = roles.get(RoleCode.COMPANY_ADMIN);
      if (!roleId) {
        throw new BadRequestException("Company admin role missing");
      }
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId } },
        update: { tenantId: tenant.id, deletedAt: null },
        create: { tenantId: tenant.id, userId: admin.id, roleId }
      });
      return {
        tenant,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name
        }
      };
    });
  }

  async createDepartment(user: CurrentUser, dto: CreateDepartmentDto) {
    this.access.assertCanManageOrg(user);
    if (dto.parentId) {
      await this.ensureDepartment(user.tenantId, dto.parentId);
    }
    const department = await this.prisma.department.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        parentId: dto.parentId ?? null
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "DEPARTMENT_CREATED",
      targetType: "Department",
      targetId: department.id,
      metadata: { name: department.name, parentId: department.parentId }
    });
    return department;
  }

  async updateDepartment(user: CurrentUser, id: string, dto: UpdateDepartmentDto) {
    this.access.assertCanManageOrg(user);
    await this.ensureDepartment(user.tenantId, id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException("Department cannot be its own parent");
      }
      await this.ensureDepartment(user.tenantId, dto.parentId);
    }
    const department = await this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name,
        parentId: dto.parentId === undefined ? undefined : dto.parentId
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "DEPARTMENT_UPDATED",
      targetType: "Department",
      targetId: id,
      metadata: { name: dto.name ?? null, parentId: dto.parentId ?? null }
    });
    return department;
  }

  async createUser(user: CurrentUser, dto: CreateUserDto) {
    this.access.assertCanManageOrg(user);
    if (dto.departmentId) {
      await this.ensureDepartment(user.tenantId, dto.departmentId);
    }
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: user.tenantId, email: dto.email } }
    });
    if (existing && !existing.deletedAt) {
      throw new BadRequestException("Email already exists in tenant");
    }
    await this.subscriptions.assertCanAddActiveUser(user.tenantId);

    const passwordHash = await bcrypt.hash(dto.password ?? "Passw0rd!", 10);
    const created = await this.prisma.user.upsert({
      where: { tenantId_email: { tenantId: user.tenantId, email: dto.email } },
      update: {
        name: dto.name,
        departmentId: dto.departmentId ?? null,
        passwordHash,
        isActive: true,
        deletedAt: null
      },
      create: {
        tenantId: user.tenantId,
        email: dto.email,
        name: dto.name,
        departmentId: dto.departmentId ?? null,
        passwordHash
      }
    });
    await this.replaceRoles(user.tenantId, created.id, dto.roles);
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "USER_CREATED",
      targetType: "User",
      targetId: created.id,
      metadata: { email: created.email, roles: dto.roles, departmentId: dto.departmentId ?? null }
    });
    return this.getUser(user.tenantId, created.id);
  }

  async updateUser(user: CurrentUser, id: string, dto: UpdateUserDto) {
    this.access.assertCanManageOrg(user);
    const existing = await this.ensureUser(user.tenantId, id);
    if (dto.departmentId) {
      await this.ensureDepartment(user.tenantId, dto.departmentId);
    }
    if (dto.isActive === true && !existing.isActive) {
      await this.subscriptions.assertCanAddActiveUser(user.tenantId);
    }
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;
    await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        departmentId: dto.departmentId === undefined ? undefined : dto.departmentId,
        passwordHash,
        isActive: dto.isActive
      }
    });
    if (dto.roles) {
      await this.replaceRoles(user.tenantId, id, dto.roles);
    }
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "USER_UPDATED",
      targetType: "User",
      targetId: id,
      metadata: {
        name: dto.name ?? null,
        departmentId: dto.departmentId ?? null,
        roles: dto.roles ?? null,
        isActive: dto.isActive ?? null,
        passwordChanged: Boolean(dto.password)
      }
    });
    return this.getUser(user.tenantId, id);
  }

  private async replaceRoles(tenantId: string, userId: string, roleCodes: RoleCode[]) {
    if (!roleCodes.length) {
      throw new BadRequestException("At least one role is required");
    }
    const roles = await this.prisma.role.findMany({
      where: { tenantId, code: { in: roleCodes }, deletedAt: null }
    });
    if (roles.length !== new Set(roleCodes).size) {
      throw new BadRequestException("Invalid role code");
    }
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { tenantId, userId } }),
      ...roles.map((role) =>
        this.prisma.userRole.create({
          data: { tenantId, userId, roleId: role.id }
        })
      )
    ]);
  }

  private async ensureDepartment(tenantId: string, id: string) {
    const department = await this.prisma.department.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
    if (!department) {
      throw new NotFoundException("Department not found");
    }
    return department;
  }

  private async ensureUser(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null }
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  private async getUser(tenantId: string, id: string) {
    const item = await this.prisma.user.findFirstOrThrow({
      where: { id, tenantId, deletedAt: null },
      include: {
        department: true,
        roles: { where: { deletedAt: null }, include: { role: true } }
      }
    });
    return {
      id: item.id,
      email: item.email,
      name: item.name,
      departmentId: item.departmentId,
      departmentName: item.department?.name ?? null,
      isActive: item.isActive,
      roles: item.roles.map((role) => role.role.code),
      createdAt: item.createdAt
    };
  }
}
