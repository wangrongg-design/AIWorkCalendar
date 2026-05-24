import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { RoleCode } from "@prisma/client";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PrismaService } from "../prisma.service";
import { CurrentUser } from "../types/current-user";

type JwtPayload = {
  sub: string;
  tenantId: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: CurrentUser }>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authorization.slice("Bearer ".length);
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: process.env.JWT_SECRET ?? "dev-secret"
      });
    } catch {
      throw new UnauthorizedException("Invalid token");
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        isActive: true,
        deletedAt: null
      },
      include: {
        roles: { where: { deletedAt: null }, include: { role: true } }
      }
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    request.user = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      departmentId: user.departmentId,
      roles: user.roles.map((item) => item.role.code as RoleCode)
    };
    return true;
  }
}
