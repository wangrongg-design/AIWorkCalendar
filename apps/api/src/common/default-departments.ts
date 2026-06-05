import { Prisma } from "@prisma/client";

type StandardDepartmentTemplate = {
  key: string;
  name: string;
  parentKey?: string;
};

export const standardDepartmentTemplates: StandardDepartmentTemplate[] = [
  { key: "executive", name: "总经办" },
  { key: "product", name: "产品部", parentKey: "executive" },
  { key: "engineering", name: "研发部", parentKey: "executive" },
  { key: "sales", name: "销售部", parentKey: "executive" },
  { key: "marketing", name: "市场部", parentKey: "executive" },
  { key: "customer-success", name: "客户成功部", parentKey: "executive" },
  { key: "finance", name: "财务部", parentKey: "executive" },
  { key: "hr-admin", name: "人事行政部", parentKey: "executive" }
] as const;

export async function ensureStandardDepartments(tx: Prisma.TransactionClient, tenantId: string) {
  const departmentsByKey = new Map<string, { id: string }>();

  for (const template of standardDepartmentTemplates) {
    const parentId = template.parentKey ? departmentsByKey.get(template.parentKey)?.id ?? null : null;
    const existing = await tx.department.findFirst({
      where: {
        tenantId,
        name: template.name,
        deletedAt: null
      },
      select: { id: true }
    });
    const department =
      existing ??
      (await tx.department.create({
        data: {
          tenantId,
          name: template.name,
          parentId
        },
        select: { id: true }
      }));

    departmentsByKey.set(template.key, department);
  }

  return departmentsByKey;
}
