import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { CurrentUser } from "../types/current-user";

export const CurrentUserParam = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUser => {
  const request = ctx.switchToHttp().getRequest<{ user: CurrentUser }>();
  return request.user;
});

