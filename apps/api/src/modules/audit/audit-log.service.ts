import { ForbiddenException, Injectable } from "@nestjs/common";
import { AccessService } from "../../common/access/access.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";

@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService
  ) {}

  list(user: CurrentUser, limit: number) {
    if (!this.access.isCompanyAdmin(user)) {
      throw new ForbiddenException("Only company admins can view audit logs");
    }
    return this.prisma.auditLog.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(Math.max(limit || 50, 1), 200)
    });
  }
}
