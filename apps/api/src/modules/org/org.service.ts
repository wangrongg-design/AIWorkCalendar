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

function normalizeEmail(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(value?: string | null) {
  const normalized = value?.trim().replace(/[\s-]/g, "");
  return normalized || null;
}

function contactWhere(email?: string | null, phone?: string | null) {
  const OR = [
    email ? { email } : null,
    phone ? { phone } : null
  ].filter(Boolean) as Array<{ email: string } | { phone: string }>;
  return OR.length ? { OR } : null;
}

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
        phone: item.phone,
        name: item.name,
        departmentId: item.departmentId,
        departmentName: item.department?.name ?? null,
        isActive: item.isActive,
        requiresWorkReport: item.requiresWorkReport,
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
    const adminEmail = normalizeEmail(dto.adminEmail);
    if (!adminEmail) {
      throw new BadRequestException("Admin email is required");
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
          seatLimit: 0,
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
        where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
        update: {
          name: dto.adminName,
          passwordHash,
          isActive: true,
          requiresWorkReport: false,
          deletedAt: null
        },
        create: {
          tenantId: tenant.id,
          email: adminEmail,
          name: dto.adminName,
          passwordHash,
          requiresWorkReport: false
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
    const email = normalizeEmail(dto.email);
    const phone = normalizePhone(dto.phone);
    this.assertValidContact(email, phone);
    const contactFilter = contactWhere(email, phone);
    if (!contactFilter) {
      throw new BadRequestException("请至少填写邮箱或手机号");
    }
    const matchingUsers = await this.prisma.user.findMany({
      where: { tenantId: user.tenantId, ...contactFilter },
      select: { id: true, deletedAt: true }
    });
    const activeConflict = matchingUsers.find((item) => !item.deletedAt);
    if (activeConflict) {
      throw new BadRequestException("邮箱或手机号已被当前企业其他账号使用");
    }
    const deletedMatches = [...new Set(matchingUsers.map((item) => item.id))];
    if (deletedMatches.length > 1) {
      throw new BadRequestException("邮箱和手机号分别匹配到不同的已删除账号，请更换联系方式或联系运维处理");
    }
    await this.subscriptions.assertCanAddActiveUser(user.tenantId);

    const passwordHash = await bcrypt.hash(dto.password ?? "Passw0rd!", 10);
    const data = {
      email,
      phone,
      name: dto.name,
      departmentId: dto.departmentId ?? null,
      passwordHash,
      isActive: true,
      requiresWorkReport: dto.requiresWorkReport ?? true,
      deletedAt: null
    };
    const created = deletedMatches[0]
      ? await this.prisma.user.update({
          where: { id: deletedMatches[0] },
          data
        })
      : await this.prisma.user.create({
          data: {
            tenantId: user.tenantId,
            ...data
          }
        });
    await this.replaceRoles(user.tenantId, created.id, dto.roles);
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "USER_CREATED",
      targetType: "User",
      targetId: created.id,
      metadata: { email: created.email, phone: created.phone, roles: dto.roles, departmentId: dto.departmentId ?? null, requiresWorkReport: created.requiresWorkReport }
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
    const email = dto.email === undefined ? existing.email : normalizeEmail(dto.email);
    const phone = dto.phone === undefined ? existing.phone : normalizePhone(dto.phone);
    this.assertValidContact(email, phone);
    const contactFilter = contactWhere(email, phone);
    if (contactFilter) {
      const contactConflict = await this.prisma.user.findFirst({
        where: {
          tenantId: user.tenantId,
          id: { not: id },
          ...contactFilter
        },
        select: { id: true }
      });
      if (contactConflict) {
        throw new BadRequestException("邮箱或手机号已被当前企业其他账号使用");
      }
    }
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 10) : undefined;
    await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email === undefined ? undefined : email,
        phone: dto.phone === undefined ? undefined : phone,
        name: dto.name,
        departmentId: dto.departmentId === undefined ? undefined : dto.departmentId,
        passwordHash,
        isActive: dto.isActive,
        requiresWorkReport: dto.requiresWorkReport
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
        requiresWorkReport: dto.requiresWorkReport ?? null,
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

  private assertValidContact(email?: string | null, phone?: string | null) {
    if (!email && !phone) {
      throw new BadRequestException("请至少填写邮箱或手机号");
    }
    if (phone && !/^\+?\d{6,20}$/.test(phone)) {
      throw new BadRequestException("手机号格式不正确");
    }
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
      phone: item.phone,
      name: item.name,
      departmentId: item.departmentId,
      departmentName: item.department?.name ?? null,
      isActive: item.isActive,
      requiresWorkReport: item.requiresWorkReport,
      roles: item.roles.map((role) => role.role.code),
      createdAt: item.createdAt
    };
  }
}
