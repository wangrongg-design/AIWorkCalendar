import { Prisma, PrismaClient, RoleCode } from "@prisma/client";

const prisma = new PrismaClient();

function requiredKey() {
  const tenantId = process.env.TENANT_ID?.trim();
  const tenantCode = process.env.TENANT_CODE?.trim();
  const tenantKey = process.env.TENANT_KEY?.trim();
  const userId = process.env.USER_ID?.trim();
  const userEmail = process.env.USER_EMAIL?.trim().toLowerCase();
  const userPhone = process.env.USER_PHONE?.trim();
  const userName = process.env.USER_NAME?.trim();
  const userKey = process.env.USER_KEY?.trim();
  if (!tenantId && !tenantCode && !tenantKey) {
    throw new Error("请设置 TENANT_ID、TENANT_CODE 或 TENANT_KEY 来定位企业");
  }
  if (!userId && !userEmail && !userPhone && !userName && !userKey) {
    throw new Error("请设置 USER_ID、USER_EMAIL、USER_PHONE、USER_NAME 或 USER_KEY 来定位账号");
  }
  return { tenantId, tenantCode, tenantKey, userId, userEmail, userPhone, userName, userKey };
}

async function main() {
  const { tenantId, tenantCode, tenantKey, userId, userEmail, userPhone, userName, userKey } = requiredKey();
  const tenantCandidates = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
      ...(tenantId
        ? { id: tenantId }
        : tenantCode
          ? { code: tenantCode }
          : { OR: [{ code: tenantKey }, { name: { contains: tenantKey } }] })
    },
    select: { id: true, name: true, code: true }
  });
  if (tenantCandidates.length !== 1) {
    console.log("匹配到的企业：", tenantCandidates);
    throw new Error(`企业匹配数量为 ${tenantCandidates.length}，请改用 TENANT_ID 或 TENANT_CODE 精确定位`);
  }
  const tenant = tenantCandidates[0];
  const userOr: Prisma.UserWhereInput[] = [];
  if (userEmail) userOr.push({ email: userEmail });
  if (userPhone) userOr.push({ phone: userPhone });
  if (userName) userOr.push({ name: userName });
  if (userKey) {
    userOr.push({ email: userKey.toLowerCase() }, { phone: userKey }, { name: { contains: userKey } });
  }

  const userCandidates = await prisma.user.findMany({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      ...(userId
        ? { id: userId }
        : { OR: userOr })
    },
    select: { id: true, name: true, email: true, phone: true, isActive: true }
  });
  if (userCandidates.length !== 1) {
    console.log("匹配到的账号：", userCandidates);
    throw new Error(`账号匹配数量为 ${userCandidates.length}，请改用 USER_ID、USER_EMAIL 或 USER_PHONE 精确定位`);
  }
  const targetUser = userCandidates[0];

  const restored = await prisma.$transaction(async (tx) => {
    const adminRole = await tx.role.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: RoleCode.COMPANY_ADMIN } },
      update: { name: "企业管理员", deletedAt: null },
      create: { tenantId: tenant.id, code: RoleCode.COMPANY_ADMIN, name: "企业管理员" }
    });
    await tx.user.update({
      where: { id: targetUser.id },
      data: { isActive: true, failedLoginCount: 0, lockedUntil: null, deletedAt: null }
    });
    await tx.userRole.updateMany({
      where: { tenantId: tenant.id, userId: targetUser.id, roleId: { not: adminRole.id }, deletedAt: null },
      data: { deletedAt: new Date() }
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: targetUser.id, roleId: adminRole.id } },
      update: { tenantId: tenant.id, deletedAt: null },
      create: { tenantId: tenant.id, userId: targetUser.id, roleId: adminRole.id }
    });
    return tx.user.findUniqueOrThrow({
      where: { id: targetUser.id },
      include: { roles: { where: { deletedAt: null }, include: { role: true } } }
    });
  });

  console.log("已恢复企业管理员：", {
    tenant: { id: tenant.id, name: tenant.name, code: tenant.code },
    user: { id: restored.id, name: restored.name, email: restored.email, phone: restored.phone, isActive: restored.isActive },
    roles: restored.roles.map((item) => item.role.code)
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
