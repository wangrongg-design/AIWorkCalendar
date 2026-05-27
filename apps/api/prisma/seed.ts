import { PrismaClient, ProjectStatus, RoleCode, SubscriptionPlan, SubscriptionStatus, WorkLogStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const password = "Passw0rd!";
const demoCompanyName = "北京星澜智能科技有限公司";
const demoUnifiedSocialCreditCode = "91110105MA01A1B2X3";

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
  const existingDemoTenant =
    (await prisma.tenant.findUnique({ where: { code: demoUnifiedSocialCreditCode } })) ??
    (await prisma.tenant.findUnique({ where: { code: "demo" } }));
  const tenant = existingDemoTenant
    ? await prisma.tenant.update({
        where: { id: existingDemoTenant.id },
        data: { name: demoCompanyName, code: demoUnifiedSocialCreditCode, deletedAt: null }
      })
    : await prisma.tenant.create({ data: { name: demoCompanyName, code: demoUnifiedSocialCreditCode } });
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

  const executive = await prisma.department.upsert({
    where: { id: "seed-dept-executive" },
    update: { tenantId: tenant.id, name: "总经办", parentId: null, deletedAt: null },
    create: { id: "seed-dept-executive", tenantId: tenant.id, name: "总经办", parentId: null }
  });

  const market = await prisma.department.upsert({
    where: { id: "seed-dept-product" },
    update: { tenantId: tenant.id, name: "市场部", parentId: executive.id, deletedAt: null },
    create: { id: "seed-dept-product", tenantId: tenant.id, name: "市场部", parentId: executive.id }
  });

  const engineering = await prisma.department.upsert({
    where: { id: "seed-dept-engineering" },
    update: { tenantId: tenant.id, name: "研发部", parentId: executive.id, deletedAt: null },
    create: { id: "seed-dept-engineering", tenantId: tenant.id, name: "研发部", parentId: executive.id }
  });

  const administration = await prisma.department.upsert({
    where: { id: "seed-dept-administration" },
    update: { tenantId: tenant.id, name: "行政部", parentId: executive.id, deletedAt: null },
    create: { id: "seed-dept-administration", tenantId: tenant.id, name: "行政部", parentId: executive.id }
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
      name: "林知远",
      departmentId: executive.id,
      role: RoleCode.COMPANY_ADMIN,
      requiresWorkReport: true
    },
    {
      email: "market.manager@example.com",
      phone: "13900000003",
      name: "周婧",
      departmentId: market.id,
      role: RoleCode.DEPARTMENT_MANAGER,
      requiresWorkReport: true
    },
    {
      email: "market.ops@example.com",
      phone: "13900000004",
      name: "陈思琪",
      departmentId: market.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "employee2@example.com",
      phone: "13900000005",
      name: "赵一然",
      departmentId: market.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "market.content@example.com",
      phone: "13900000006",
      name: "吴佳宁",
      departmentId: market.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "market.growth@example.com",
      phone: "13900000007",
      name: "孙浩",
      departmentId: market.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "manager@example.com",
      phone: "13900000008",
      name: "唐明远",
      departmentId: engineering.id,
      role: RoleCode.DEPARTMENT_MANAGER,
      requiresWorkReport: true
    },
    {
      email: "employee@example.com",
      phone: "13900000009",
      name: "李俊辰",
      departmentId: engineering.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "rd.backend@example.com",
      phone: "13900000010",
      name: "何宇航",
      departmentId: engineering.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "rd.frontend@example.com",
      phone: "13900000011",
      name: "许嘉言",
      departmentId: engineering.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "rd.qa@example.com",
      phone: "13900000012",
      name: "高宁",
      departmentId: engineering.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "rd.ai@example.com",
      phone: "13900000013",
      name: "罗子涵",
      departmentId: engineering.id,
      role: RoleCode.EMPLOYEE,
      requiresWorkReport: true
    },
    {
      email: "admin.ops@example.com",
      phone: "13900000014",
      name: "宋雨",
      departmentId: administration.id,
      role: RoleCode.DEPARTMENT_MANAGER,
      requiresWorkReport: true
    },
    {
      email: "admin.hr@example.com",
      phone: "13900000015",
      name: "邱雅楠",
      departmentId: administration.id,
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
      code: "AICAL",
      name: "AI 工作日历产品迭代",
      description: "持续完善 AI 日历、日报附件、智能汇报和组织权限体验。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["manager@example.com"],
      startDate: dateOnly(-14),
      endDate: dateOnly(45),
      deletedAt: null
    },
    create: {
      id: "seed-project-work-calendar",
      tenantId: tenant.id,
      code: "AICAL",
      name: "AI 工作日历产品迭代",
      description: "持续完善 AI 日历、日报附件、智能汇报和组织权限体验。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["manager@example.com"],
      startDate: dateOnly(-14),
      endDate: dateOnly(45)
    }
  });

  const growthProject = await prisma.project.upsert({
    where: { id: "seed-project-ai-report" },
    update: {
      tenantId: tenant.id,
      code: "GROWTH",
      name: "Q2 重点客户增长计划",
      description: "围绕重点行业客户线索、渠道活动和转化复盘推进市场增长。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["market.manager@example.com"],
      startDate: dateOnly(-20),
      endDate: dateOnly(50),
      deletedAt: null
    },
    create: {
      id: "seed-project-ai-report",
      tenantId: tenant.id,
      code: "GROWTH",
      name: "Q2 重点客户增长计划",
      description: "围绕重点行业客户线索、渠道活动和转化复盘推进市场增长。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["market.manager@example.com"],
      startDate: dateOnly(-20),
      endDate: dateOnly(50)
    }
  });

  const operationsProject = await prisma.project.upsert({
    where: { id: "seed-project-operations" },
    update: {
      tenantId: tenant.id,
      code: "OPS",
      name: "企业运营支持体系",
      description: "优化入职、办公资产、行政采购和跨部门支持流程。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["admin.ops@example.com"],
      startDate: dateOnly(-10),
      endDate: dateOnly(35),
      deletedAt: null
    },
    create: {
      id: "seed-project-operations",
      tenantId: tenant.id,
      code: "OPS",
      name: "企业运营支持体系",
      description: "优化入职、办公资产、行政采购和跨部门支持流程。",
      status: ProjectStatus.ACTIVE,
      ownerUserId: seededUsers["admin.ops@example.com"],
      startDate: dateOnly(-10),
      endDate: dateOnly(35)
    }
  });

  const today = dateOnly(0);
  const yesterday = dateOnly(-1);
  const tomorrow = dateOnly(1);
  await prisma.workLog.updateMany({
    where: { tenantId: tenant.id, id: { in: ["seed-log-product-yesterday"] } },
    data: { deletedAt: new Date() }
  });
  await prisma.aiAnalysis.updateMany({
    where: { tenantId: tenant.id, workLogId: { in: ["seed-log-product-yesterday"] } },
    data: { deletedAt: new Date() }
  });
  const logs = [
    {
      id: "seed-log-ceo-today",
      userId: seededUsers["admin@example.com"],
      projectId: growthProject.id,
      date: today,
      title: "确定二季度重点客户推进节奏",
      content: "上午和市场、研发负责人确认 Q2 重点客户推进节奏，要求本周完成 3 家标杆客户方案复盘。需要关注大客户交付排期和售前资源冲突。",
      startTime: hoursAgoDate(today, 1),
      endTime: hoursAgoDate(today, 2, 30),
      hours: "1.5",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-market-manager-today",
      userId: seededUsers["market.manager@example.com"],
      projectId: growthProject.id,
      date: today,
      title: "复盘渠道线索转化",
      content: "梳理本月渠道线索 42 条，确认 8 条进入销售跟进池。发现华东区域活动转化偏低，明天需要补充客户画像分析。",
      startTime: hoursAgoDate(today, 2),
      endTime: hoursAgoDate(today, 4, 30),
      hours: "2.5",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-market-ops-today",
      userId: seededUsers["market.ops@example.com"],
      projectId: growthProject.id,
      date: today,
      title: "整理华东客户回访清单",
      content: "完成华东 18 家客户回访清单整理，补充行业、规模、痛点和下一步触达时间，已同步给销售同事。",
      startTime: hoursAgoDate(today, 3),
      endTime: hoursAgoDate(today, 6),
      hours: "3",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-manager-today",
      userId: seededUsers["manager@example.com"],
      projectId: coreProject.id,
      date: today,
      title: "评审 AI 日历性能方案",
      content: "评审 AI 日历月视图性能优化方案，确认缓存粒度和按部门权限裁剪策略，风险是历史数据量增长后还需要继续压测。",
      startTime: hoursAgoDate(today, 1),
      endTime: hoursAgoDate(today, 3),
      hours: "2",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-employee-today",
      userId: seededUsers["employee@example.com"],
      projectId: coreProject.id,
      date: today,
      title: "完成日报详情附件预览",
      content: "完成日报详情中的附件预览和下载入口，照片、PDF、Word 均可在详情区查看，准备联调小程序附件展示。",
      startTime: hoursAgoDate(today, 3),
      endTime: hoursAgoDate(today, 6, 30),
      hours: "3.5",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-rd-backend-today",
      userId: seededUsers["rd.backend@example.com"],
      projectId: coreProject.id,
      date: today,
      title: "修复注册计费联调问题",
      content: "修复企业注册后订阅初始化和本地演示计费接口，确认专业版按启用成员数计算金额。",
      startTime: hoursAgoDate(today, 4),
      endTime: hoursAgoDate(today, 6, 30),
      hours: "2.5",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-admin-ops-today",
      userId: seededUsers["admin.ops@example.com"],
      projectId: operationsProject.id,
      date: today,
      title: "更新办公采购和入职物料",
      content: "整理本周新员工入职物料和办公采购清单，确认 2 台笔记本到货时间，行政流程暂无阻塞。",
      startTime: hoursAgoDate(today, 5),
      endTime: hoursAgoDate(today, 7),
      hours: "2",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-market-content-yesterday",
      userId: seededUsers["market.content@example.com"],
      projectId: growthProject.id,
      date: yesterday,
      title: "完成行业案例初稿",
      content: "完成制造业客户案例初稿，突出 AI 日历对日报沉淀和风险发现的价值，等待客户授权截图。",
      startTime: hoursAgoDate(yesterday, 2),
      endTime: hoursAgoDate(yesterday, 6),
      hours: "4",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-rd-qa-yesterday",
      userId: seededUsers["rd.qa@example.com"],
      projectId: coreProject.id,
      date: yesterday,
      title: "执行 Web 回归测试",
      content: "完成登录、注册、AI 日历、填报、组织权限和订阅页回归测试，发现 2 个视觉细节问题已记录。",
      startTime: hoursAgoDate(yesterday, 2),
      endTime: hoursAgoDate(yesterday, 5, 30),
      hours: "3.5",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-admin-hr-yesterday",
      userId: seededUsers["admin.hr@example.com"],
      projectId: operationsProject.id,
      date: yesterday,
      title: "完成员工档案核对",
      content: "核对市场部和研发部员工档案，补齐手机号和部门归属，准备下周入职培训安排。",
      startTime: hoursAgoDate(yesterday, 3),
      endTime: hoursAgoDate(yesterday, 5),
      hours: "2",
      status: WorkLogStatus.SUBMITTED
    },
    {
      id: "seed-log-rd-ai-tomorrow",
      userId: seededUsers["rd.ai@example.com"],
      projectId: coreProject.id,
      date: tomorrow,
      title: "AI 汇报质量评估计划",
      content: "计划抽样 20 条日报评估 AI 汇报结构，重点检查风险、阻塞和建议动作是否可执行。",
      startTime: hoursAgoDate(tomorrow, 2),
      endTime: hoursAgoDate(tomorrow, 4),
      hours: "2",
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
  console.log(`Unified social credit code: ${demoUnifiedSocialCreditCode}`);
  console.log(`Demo company: ${demoCompanyName}`);
  console.log("Organization: 总经办 1 人，市场部 5 人，研发部 6 人，行政部 2 人");
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
