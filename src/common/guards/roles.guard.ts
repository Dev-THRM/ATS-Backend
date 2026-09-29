import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SystemRoleType } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly reflector: Reflector;

  constructor(@Optional() @Inject(Reflector) reflector?: Reflector) {
    this.reflector = reflector ?? new Reflector();
  }

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(SystemRoleType | string)[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles or permissions are required, allow access
    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException(
        'Access denied: User is not authenticated for role verification',
      );
    }

    // Super Admin, Admin or wildcard '*' permission has unrestricted access
    if (
      user.roleType === SystemRoleType.SUPER_ADMIN ||
      user.roleType === SystemRoleType.ADMIN ||
      user.permissions?.includes('*')
    ) {
      return true;
    }

    // Validate Roles if specified
    let hasRoleMatch = true;
    if (requiredRoles && requiredRoles.length > 0) {
      hasRoleMatch = requiredRoles.some(
        (role) =>
          role === user.roleType ||
          role === user.roleId ||
          role === user.roleName,
      );
    }

    // Validate Permissions if specified
    let hasPermissionMatch = true;
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions: string[] = user.permissions || [];
      hasPermissionMatch = requiredPermissions.some((requiredPerm) =>
        this.matchPermission(userPermissions, requiredPerm),
      );
    }

    // If roles were specified, must match roles. If permissions were specified, must match permissions.
    const isAuthorized =
      (requiredRoles ? hasRoleMatch : true) &&
      (requiredPermissions ? hasPermissionMatch : true);

    if (!isAuthorized) {
      throw new ForbiddenException(
        'Access denied: You do not have sufficient roles or permissions to perform this action',
      );
    }

    return true;
  }

  /**
   * Check if a required permission matches user's permission list (supporting domain wildcards like 'jobs:*').
   */
  private matchPermission(
    userPermissions: string[],
    requiredPerm: string,
  ): boolean {
    if (userPermissions.includes('*') || userPermissions.includes(requiredPerm)) {
      return true;
    }

    // Support wildcard matching e.g., 'jobs:*' matches 'jobs:create'
    const [requiredDomain] = requiredPerm.split(':');
    return userPermissions.some((userPerm) => {
      if (userPerm === `${requiredDomain}:*`) return true;
      return false;
    });
  }
}
