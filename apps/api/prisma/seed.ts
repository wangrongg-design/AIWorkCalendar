import { PrismaClient, ProjectStatus, RoleCode, SubscriptionPlan, SubscriptionStatus, WorkLogStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const password = "Passw0rd!";

function dateOnly(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function hoursAgoDate(date: Date, hour: number, minute = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute));
}

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);
  const tenant = await prisma.tenant.upsert({
    where: { code: "demo" },
    update: { name: "示例科技有限公司", deletedAt: null },
    create: { name: "示例科技有限公司", code: "demo" }
  });
  await prisma.subscription.upsert({
    where: { tenantId: tenant.id },
    update: {
      plan: SubscriptionPlan.TEAM,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 0,
      currentPeriodStart: dateOnly(0),
      currentPeriodEnd: dateOnly(365),
      deletedAt: null
    },
    create: {
      tenantId: tenant.id,
      plan: SubscriptionPlan.TEAM,
      status: SubscriptionStatus.ACTIVE,
      seatLimit: 0,
      currentPeriodStart: dateOnly(0),
      currentPeriodEnd: dateOnly(365)
    }
  });

  const roleDefs: Array<{ code: RoleCode; name: string }> = [
    { code: RoleCode.SUPER_ADMIN, name: "超级管理员" },
    { code: RoleCode.COMPANY_ADMIN, name: "企业管理员" },
    { code: RoleCode.DEPARTMENT_MANAGER, name: "部门经理" },
    { code: RoleCode.EMPLOYEE, name: "普通员工" }
  ];

  const roles = new Map<RoleCode, string>();
  for (const roleDef of roleDefs) {
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: roleDef.code } },
      update: { name: roleDef.name, deletedAt: null },
      create: { tenantId: tenant.id, code: roleDef.code, name: roleDef.name }
    });
    roles.set(roleDef.code, role.id);
  }

  const engineering = await prisma.department.upsert({
    where: { id: "seed-dept-engineering" },
    update: { tenantId: tenant.id, name: "研发部", deletedAt: null },
    create: { id: "seed-dept-engineering", tenantId: tenant.id, name: "研发部" }
  });

  const product = await prisma.department.upsert({
    where: { id: "seed-dept-product" },
    update: { tenantId: tenant.id, name: "产品部", deletedAt: null },
    create: { id: "seed-dept-product", tenantId: tenant.id, name: "产品部" }
  });

  const users = [
    {
      email: "super@example.com",
      phone: "13900000001",
      name: "平台超管",
      departmentId: null,
      role: RoleCode.SUPER_ADMIN,
      requiresWorkReport: false
    },
    {
      email: "admin@example.com",
      phone: "13900000002",
      name: "企业管理员",
      departmentId: null,
      role: RoleCode.COMPANY_ADMIN,
      requiresWorkReport: false
    },
    {
      email: "manager@example.com",
      phone: "13900000003",
      name: "研发经理",
      departmentId: engineering.id,
      role: RoleCode.DEPARTMENT_MANAGER,
      requiresWorkReport: true
    },
    {
      email: "employee@example.com",
      phone: "13900000004",
      name: "研发员工一",
      departmentId: engineering.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "employee2@example.com",
      phone: "13900000005",
      name: "产品员工一",
      departmentId: product.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    }
  ];

  const seededUsers: Record<string, string> = {};
  for (const userDef of users) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: userDef.email } },
      update: {
        name: userDef.name,
        departmentId: userDef.departmentId,
        phone: userDef.phone,
        passwordHash,
        isActive: true,
        requiresWorkReport: userDef.requiresWorkReport,
        deletedAt: null
      },
      create: {
        tenantId: tenant.id,
        email: userDef.email,
        phone: userDef.phone,
        name: userDef.name,
        departmentId: userDef.departmentId,
        passwordHash,
        isActive: true,
        requiresWorkReport: userDef.requiresWorkReport
      }
    });
    seededUsers[userDef.email] = user.id;
    const roleId = roles.get(userDef.role);
    if (!roleId) {
      throw new Error(`Missing role ${userDef.role}`);
    }
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: { tenantId: tenant.id, deletedAt: null },
      create: { tenantId: tenant.id, userId: user.id, roleId }
    });
  }

  const coreProject = await prisma.project.upsert({
    where: { id: "seed-project-work-calendar" },
    update: {
      tenantId: tenant.id,
      code: "WCA",
      name: "Work Calendar AI 商业化版本",
      description: "围绕日报、计划、日历看板、AI 汇报和发布准备的核心产品项目。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["manager@example.com"],
      startDate: dateOnly(-14),
      endDate: dateOnly(45),
      deletedAt: null
    },
    create: {
      id: "seed-project-work-calendar",
      tenantId: tenant.id,
      code: "WCA",
      name: "Work Calendar AI 商业化版本",
      description: "围绕日报、计划、日历看板、AI 汇报和发布准备的核心产品项目。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["manager@example.com"],
      startDate: dateOnly(-14),
      endDate: dateOnly(45)
    }
  });

  const aiProject = await prisma.project.upsert({
    where: { id: "seed-project-ai-report" },
    update: {
      tenantId: tenant.id,
      code: "AIR",
      name: "AI 汇报能力优化",
      description: "优化 AI 分析、问答和日报周报生成质量。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["admin@example.com"],
      startDate: dateOnly(-7),
      endDate: dateOnly(30),
      deletedAt: null
    },
    create: {
      id: "seed-project-ai-report",
      tenantId: tenant.id,
      code: "AIR",
      name: "AI 汇报能力优化",
      description: "优化 AI 分析、问答和日报周报生成质量。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["admin@example.com"],
      startDate: dateOnly(-7),
      endDate: dateOnly(30)
    }
  });

  const today = dateOnly(0);
  const yesterday = dateOnly(-1);
  const logs = [
    {
      id: "seed-log-employee-today",
      userId: seededUsers["employee@example.com"],
      projectId: coreProject.id,
      date: today,
      title: "完成日报月历查询",
      content: "实现管理驾驶舱的月历查询接口，补充部门权限过滤，并完成接口自测。风险是月末大数据量需要继续压测。",
      startTime: hoursAgoDate(today, 1),
      endTime: hoursAgoDate(today, 4, 30),
      hours: "3.5",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-manager-today",
      userId: seededUsers["manager@example.com"],
      projectId: aiProject.id,
      date: today,
      title: "评审 AI 分析提示词",
      content: "评审工作填报 AI 分析 Prompt，明确成果、风险、阻塞字段的 JSON 输出结构。明天继续观察失败重试。",
      startTime: hoursAgoDate(today, 5),
      endTime: hoursAgoDate(today, 7),
      hours: "2",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-product-yesterday",
      userId: seededUsers["employee2@example.com"],
      projectId: coreProject.id,
      date: yesterday,
      title: "梳理组织权限页面",
      content: "梳理企业管理员新增部门和员工的最小闭环，确认第一版不加入审批流。",
      startTime: hoursAgoDate(yesterday, 2),
      endTime: hoursAgoDate(yesterday, 5),
      hours: "3",
      status: WorkLogStatus.SUBMITTED
    }
  ];

  for (const log of logs) {
    await prisma.workLog.upsert({
      where: { id: log.id },
      update: {
        tenantId: tenant.id,
        userId: log.userId,
        projectId: log.projectId,
        date: log.date,
        title: log.title,
        content: log.content,
        startTime: log.startTime,
        endTime: log.endTime,
        hours: log.hours,
        status: log.status,
        submittedAt: new Date(),
        deletedAt: null
      },
      create: {
        ...log,
        tenantId: tenant.id,
        submittedAt: new Date()
      }
    });

    await prisma.aiAnalysis.upsert({
      where: { workLogId: log.id },
      update: {
        tenantId: tenant.id,
        userId: log.userId,
        category: "研发交付",
        achievements: ["完成核心功能推进"],
        risks: log.content.includes("风险") ? ["存在后续压测或重试观察风险"] : [],
        blockers: [],
        keywords: ["日报", "AI", "权限"],
        tags: ["MVP", "工作填报"],
        timeReasonableness: "工时与工作内容基本匹配",
        summary: "完成当天核心任务，并识别了下一步需要关注的问题。",
        raw: { seeded: true }
      },
      create: {
        tenantId: tenant.id,
        workLogId: log.id,
        userId: log.userId,
        category: "研发交付",
        achievements: ["完成核心功能推进"],
        risks: log.content.includes("风险") ? ["存在后续压测或重试观察风险"] : [],
        blockers: [],
        keywords: ["日报", "AI", "权限"],
        tags: ["MVP", "工作填报"],
        timeReasonableness: "工时与工作内容基本匹配",
        summary: "完成当天核心任务，并识别了下一步需要关注的问题。",
        raw: { seeded: true }
      }
    });
  }

  console.log("Seed completed.");
  console.log("Tenant code: demo");
  console.log(`Password for all seed users: ${password}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
