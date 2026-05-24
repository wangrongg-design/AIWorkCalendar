import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { RoleCode } from "@prisma/client";
import { CurrentUserParam } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/types/current-user";
import { BillingService } from "./billing.service";
import { ConfirmManualPaymentDto, CreateBillingOrderDto } from "./dto/order.dto";
import { UpdateSubscriptionDto } from "./dto/update-subscription.dto";

@ApiBearerAuth()
@ApiTags("Billing")
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get("subscription")
  getCurrentSubscription(@CurrentUserParam() user: CurrentUser) {
    return this.billingService.getCurrentSubscription(user);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Patch("subscription")
  updateCurrentSubscription(@CurrentUserParam() user: CurrentUser, @Body() dto: UpdateSubscriptionDto) {
    return this.billingService.updateCurrentSubscription(user, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Patch("tenants/:tenantId/subscription")
  updateTenantSubscription(
    @CurrentUserParam() user: CurrentUser,
    @Param("tenantId") tenantId: string,
    @Body() dto: UpdateSubscriptionDto
  ) {
    return this.billingService.updateTenantSubscription(user, tenantId, dto);
  }

  @Get("orders")
  listOrders(@CurrentUserParam() user: CurrentUser) {
    return this.billingService.listOrders(user);
  }

  @Post("orders")
  createOrder(@CurrentUserParam() user: CurrentUser, @Body() dto: CreateBillingOrderDto) {
    return this.billingService.createOrder(user, dto);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post("orders/:orderId/confirm-manual-payment")
  confirmManualPayment(
    @CurrentUserParam() user: CurrentUser,
    @Param("orderId") orderId: string,
    @Body() dto: ConfirmManualPaymentDto
  ) {
    return this.billingService.confirmManualPayment(user, orderId, dto);
  }
}
