import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanGuard } from './plan.guard.js';
import { AppPlan } from '@prisma/client';

describe('PlanGuard', () => {
  let guard: PlanGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PlanGuard(reflector);
  });

  const createMockContext = (activePlans: string[]): ExecutionContext => {
    return {
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            organizationId: 'org-1',
            activePlans,
          },
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access if route has no plan restrictions', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext([AppPlan.ATS]);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when organization has required plan active', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AppPlan.ATS]);
    const context = createMockContext([AppPlan.ATS]);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when organization lacks required subscription plan', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ENTERPRISE_CUSTOM' as any]);
    const context = createMockContext([AppPlan.ATS]); // Only has ATS, trying to access ENTERPRISE_CUSTOM

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
