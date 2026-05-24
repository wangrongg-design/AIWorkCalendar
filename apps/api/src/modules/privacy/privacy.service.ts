import { ForbiddenException, Injectable } from "@nestjs/common";
import { DataDeletionScope, DataDeletionStatus } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { RequestDataDeletionDto } from "./dto/data-deletion.dto";

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService
  ) {}

  async requestDeletion(user: CurrentUser, dto: RequestDataDeletionDto) {
    if (dto.scope === DataDeletionScope.TENANT && !this.access.isCompanyAdmin(user)) {
      throw new ForbiddenException("Only company admins can request tenant deletion");
    }
    const request = await this.prisma.dataDeletionRequest.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.id,
        scope: dto.scope,
        reason: dto.reason,
        status: DataDeletionStatus.REQUESTED
      }
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "DATA_DELETION_REQUESTED",
      targetType: "DataDeletionRequest",
      targetId: request.id,
      metadata: { scope: dto.scope, reason: dto.reason ?? null }
    });
    return request;
  }

  listRequests(user: CurrentUser) {
    return this.prisma.dataDeletionRequest.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(this.access.isCompanyAdmin(user) ? {} : { requesterId: user.id })
      },
      orderBy: [{ createdAt: "desc" }]
    });
  }
}
