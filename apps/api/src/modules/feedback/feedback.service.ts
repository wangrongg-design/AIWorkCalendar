import { Injectable, NotFoundException } from "@nestjs/common";
import { FeedbackStatus, Prisma } from "@prisma/client";
import { AccessService } from "../../common/access/access.service";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma.service";
import { CurrentUser } from "../../common/types/current-user";
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from "./dto/feedback.dto";

const feedbackInclude = {
  requester: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      department: { select: { id: true, name: true } }
    }
  }
} satisfies Prisma.FeedbackRequestInclude;

function cleanOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService
  ) {}

  listRequests(user: CurrentUser) {
    return this.prisma.feedbackRequest.findMany({
      where: {
        tenantId: user.tenantId,
        deletedAt: null,
        ...(this.access.isCompanyAdmin(user) ? {} : { requesterId: user.id })
      },
      include: feedbackInclude,
      orderBy: [{ createdAt: "desc" }]
    });
  }

  async createRequest(user: CurrentUser, dto: CreateFeedbackDto) {
    const request = await this.prisma.feedbackRequest.create({
      data: {
        tenantId: user.tenantId,
        requesterId: user.id,
        category: dto.category,
        priority: dto.priority,
        title: dto.title.trim(),
        content: dto.content.trim(),
        contact: cleanOptional(dto.contact)
      },
      include: feedbackInclude
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "FEEDBACK_REQUEST_CREATED",
      targetType: "FeedbackRequest",
      targetId: request.id,
      metadata: {
        category: request.category,
        priority: request.priority
      }
    });

    return request;
  }

  async updateStatus(user: CurrentUser, id: string, dto: UpdateFeedbackStatusDto) {
    this.access.assertCanManageOrg(user);
    const request = await this.prisma.feedbackRequest.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null }
    });
    if (!request) {
      throw new NotFoundException("Feedback request not found");
    }

    const isFinished = dto.status === FeedbackStatus.RESOLVED || dto.status === FeedbackStatus.CLOSED;
    const updated = await this.prisma.feedbackRequest.update({
      where: { id: request.id },
      data: {
        status: dto.status,
        resolution: dto.resolution === undefined ? undefined : cleanOptional(dto.resolution),
        resolvedAt: isFinished ? new Date() : null
      },
      include: feedbackInclude
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "FEEDBACK_REQUEST_UPDATED",
      targetType: "FeedbackRequest",
      targetId: updated.id,
      metadata: {
        previousStatus: request.status,
        status: updated.status,
        hasResolution: Boolean(updated.resolution)
      }
    });

    return updated;
  }
}
