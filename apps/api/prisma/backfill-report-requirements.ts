import { PrismaClient, RoleCode } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminRoleLinks = await prisma.userRole.findMany({
    where: {
      deletedAt: null,
      role: {
        code: RoleCode.COMPANY_ADMIN,
        deletedAt: null
      },
      user: {
        deletedAt: null
      }
    },
    select: { userId: true }
  });

  const adminUserIds = [...new Set(adminRoleLinks.map((item) => item.userId))];
  if (!adminUserIds.length) {
    console.log("No admin accounts found.");
    return;
  }

  const result = await prisma.user.updateMany({
    where: { id: { in: adminUserIds } },
    data: { requiresWorkReport: false }
  });

  console.log(`Backfilled ${result.count} admin accounts: requiresWorkReport=false.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
