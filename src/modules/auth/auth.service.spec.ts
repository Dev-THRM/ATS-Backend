import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { AppPlan, SystemRoleType } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let configService: any;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'owner@acme.com',
    passwordHash: '',
    firstName: 'John',
    lastName: 'Doe',
    phone: null,
    avatarUrl: null,
    isActive: true,
    refreshTokenHash: null,
    organizationId: 'org-uuid-1',
    roleId: 'role-uuid-1',
    role: {
      id: 'role-uuid-1',
      name: 'Super Admin',
      type: SystemRoleType.SUPER_ADMIN,
      permissions: ['*'],
    },
    organization: {
      id: 'org-uuid-1',
      name: 'Acme Corp',
      slug: 'acme',
      subscriptions: [
        {
          activePlans: [AppPlan.ATS],
          status: 'TRIALING',
        },
      ],
    },
  };

  beforeEach(async () => {
    mockUser.passwordHash = await bcrypt.hash('Password123!', 10);

    prisma = {
      organization: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    };

    jwtService = {
      signAsync: vi.fn().mockImplementation((payload) => {
        return Promise.resolve(`signed_token_for_${payload.sub || 'test'}`);
      }),
      verify: vi.fn(),
    };

    configService = {
      get: vi.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test_secret_1234567890_test_secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test_refresh_secret_1234567890';
        if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should throw ConflictException if organization slug is already in use', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'existing-org' });

      await expect(
        service.register({
          organizationName: 'Acme Corp',
          organizationSlug: 'acme',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@acme.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully register organization, owner user, roles, and return tokens', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementation(async (cb: any) => {
        const tx = {
          organization: { create: vi.fn().mockResolvedValue(mockUser.organization) },
          role: {
            create: vi.fn().mockResolvedValue(mockUser.role),
            createMany: vi.fn().mockResolvedValue({ count: 4 }),
          },
          subscription: {
            create: vi.fn().mockResolvedValue(mockUser.organization.subscriptions[0]),
          },
          user: { create: vi.fn().mockResolvedValue(mockUser) },
        };
        return cb(tx);
      });

      prisma.user.update.mockResolvedValue(mockUser);

      const response = await service.register({
        organizationName: 'Acme Corp',
        organizationSlug: 'acme',
        firstName: 'John',
        lastName: 'Doe',
        email: 'owner@acme.com',
        password: 'Password123!',
      });

      expect(response).toBeDefined();
      expect(response.user.email).toBe('owner@acme.com');
      expect(response.tokens.accessToken).toBeDefined();
      expect(response.tokens.refreshToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('should throw UnauthorizedException for invalid email or credentials', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return user summary and tokens on valid login credentials', async () => {
      prisma.user.findMany.mockResolvedValue([mockUser]);
      prisma.user.update.mockResolvedValue(mockUser);

      const response = await service.login({
        email: 'owner@acme.com',
        password: 'Password123!',
      });

      expect(response.user.id).toBe(mockUser.id);
      expect(response.tokens.accessToken).toBeDefined();
      expect(response.tokens.refreshToken).toBeDefined();
    });
  });

  describe('logout', () => {
    it('should clear refreshTokenHash in the database', async () => {
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await service.logout('user-uuid-1');
      expect(result).toEqual({
        message: 'Logged out successfully',
        allDevices: false,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid-1' },
        data: { refreshTokenHash: null },
      });
    });
  });

  describe('getMe', () => {
    it('should return user details and organization active plans', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe('user-uuid-1');
      expect(result.id).toBe('user-uuid-1');
      expect(result.organization.activePlans).toContain(AppPlan.ATS);
    });
  });
});
