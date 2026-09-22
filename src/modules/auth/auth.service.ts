import {
  Injectable,
  Inject,
  Optional,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { AppPlan, SystemRoleType } from '@prisma/client';
import crypto from 'crypto';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import {
  AuthResponse,
  AuthTokens,
  UserSummary,
  OrganizationDetail,
  OrganizationRole,
  OrganizationMember,
} from './interfaces/auth-response.interface.js';
import {
  JwtPayload,
  JwtRefreshPayload,
} from './interfaces/jwt-payload.interface.js';
import { EmailService } from '../ats/notifications/email.service.js';

import { StorageService } from '../shared/storage/storage.service.js';

export const RESERVED_SYSTEM_SLUGS = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'billing', 'careers',
  'dashboard', 'docs', 'help', 'login', 'logout', 'portal', 'register',
  'root', 'settings', 'signup', 'status', 'superadmin', 'support', 'system',
  'webhook', 'webhooks', 'jobs', 'ats', 'hrms', 'crm',
]);

export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'protonmail.com', 'mail.com', 'zoho.com', 'aol.com', 'gmx.com', 'yandex.com',
]);

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
    @Optional() @Inject(EmailService) private readonly emailService?: EmailService,
  ) {}

  /**
   * Check if organization slug is available for registration.
   */
  async checkSlugAvailability(
    slug: string,
  ): Promise<{ slug: string; available: boolean; reason?: string }> {
    if (!slug || !slug.trim()) {
      throw new BadRequestException('slug query parameter is required');
    }
    const cleanSlug = slug.toLowerCase().trim();

    if (RESERVED_SYSTEM_SLUGS.has(cleanSlug)) {
      return {
        slug: cleanSlug,
        available: false,
        reason: 'This slug is reserved by the platform',
      };
    }

    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug: cleanSlug },
      select: { id: true },
    });
    return {
      slug: cleanSlug,
      available: !existingOrg,
      reason: existingOrg ? 'Slug is already registered' : undefined,
    };
  }

  /**
   * Register a new Organization, default Roles, Subscription, and Owner User.
   */
  async register(
    dto: RegisterDto,
    initialPlan?: string,
  ): Promise<AuthResponse> {
    const slug = dto.organizationSlug.toLowerCase().trim();
    const email = dto.email.toLowerCase().trim();

    // Prevent registering reserved system slugs
    if (RESERVED_SYSTEM_SLUGS.has(slug)) {
      throw new BadRequestException(
        `The slug '${slug}' is reserved by the platform. Please choose a unique company name.`,
      );
    }

    // Check if organization slug is already taken
    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (existingOrg) {
      throw new ConflictException(
        `Organization with slug '${slug}' already exists`,
      );
    }

    // Enterprise domain verification
    const emailDomain = email.split('@')[1]?.toLowerCase() || '';
    const isPublicEmail = PUBLIC_EMAIL_DOMAINS.has(emailDomain);
    let isVerified = false;
    let verifiedDomain: string | null = null;

    if (!isPublicEmail && emailDomain) {
      const domainBase = emailDomain.split('.')[0];
      if (slug === domainBase || slug.includes(domainBase) || domainBase.includes(slug)) {
        isVerified = true;
        verifiedDomain = emailDomain;
      }
    }

    // Determine initial plans based on query param if passed
    let selectedPlans: AppPlan[] = [AppPlan.ATS];
    if (initialPlan) {
      const upperPlan = initialPlan.toUpperCase().trim();
      if (Object.values(AppPlan).includes(upperPlan as AppPlan)) {
        selectedPlans = [upperPlan as AppPlan];
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    // Atomically create Organization, Roles, Subscription, and Owner User
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Organization
      const org = await tx.organization.create({
        data: {
          name: dto.organizationName.trim(),
          slug,
          isVerified,
          verifiedDomain,
          sourcingChannels: dto.sourcingChannels && dto.sourcingChannels.length > 0
            ? dto.sourcingChannels
            : ['CAREER_PORTAL', 'LINKEDIN', 'NAUKRI', 'GLASSDOOR', 'UNSTOP', 'INDEED'],
        },
      });

      // 2. Create Default System Roles
      const superAdminRole = await tx.role.create({
        data: {
          name: 'Super Admin',
          description: 'Full organizational access and settings',
          type: SystemRoleType.SUPER_ADMIN,
          isSystem: true,
          organizationId: org.id,
          permissions: ['*'],
        },
      });

      await tx.role.createMany({
        data: [
          {
            name: 'Admin',
            description: 'Organizational administrator',
            type: SystemRoleType.ADMIN,
            isSystem: true,
            organizationId: org.id,
            permissions: [
              'org:read',
              'users:*',
              'jobs:*',
              'candidates:*',
              'interviews:*',
            ],
          },
          {
            name: 'Recruiter',
            description: 'ATS Recruiter managing jobs and candidates',
            type: SystemRoleType.RECRUITER,
            isSystem: true,
            organizationId: org.id,
            permissions: [
              'jobs:read',
              'jobs:create',
              'jobs:update',
              'candidates:*',
              'interviews:*',
            ],
          },
          {
            name: 'Manager',
            description: 'Hiring manager or team manager',
            type: SystemRoleType.MANAGER,
            isSystem: true,
            organizationId: org.id,
            permissions: [
              'jobs:read',
              'candidates:read',
              'candidates:evaluate',
              'interviews:read',
            ],
          },
          {
            name: 'Employee',
            description: 'Standard employee account',
            type: SystemRoleType.EMPLOYEE,
            isSystem: true,
            organizationId: org.id,
            permissions: ['profile:read', 'profile:update'],
          },
        ],
      });

      // 3. Create Subscription with initial trial containing requested plans
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

      const subscription = await tx.subscription.create({
        data: {
          organizationId: org.id,
          activePlans: selectedPlans,
          status: 'TRIALING',
          trialEndsAt: trialEndDate,
          maxUsers: 25,
        },
      });

      // 4. Create Owner User
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          phone: dto.phone?.trim() || null,
          organizationId: org.id,
          roleId: superAdminRole.id,
        },
        include: {
          role: true,
          organization: true,
        },
      });

      return { user, org, role: superAdminRole, subscription, activePlans: selectedPlans };
    });

    const tokens = await this.generateTokens({
      sub: result.user.id,
      email: result.user.email,
      organizationId: result.org.id,
      roleId: result.role.id,
      roleType: result.role.type,
      permissions: result.role.permissions,
      activePlans: result.activePlans,
    });

    await this.updateRefreshTokenHash(result.user.id, tokens.refreshToken);

    return {
      user: this.formatUserSummary(result.user, result.role, result.org, result.activePlans),
      tokens,
    };
  }

  /**
   * Authenticate user by email, password, and optional organization slug.
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const email = dto.email.toLowerCase().trim();

    // Query user by email
    const users = await this.prisma.user.findMany({
      where: {
        email,
        ...(dto.organizationSlug
          ? { organization: { slug: dto.organizationSlug.toLowerCase().trim() } }
          : {}),
      },
      include: {
        role: true,
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            },
          },
        },
      },
    });

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (users.length > 1 && !dto.organizationSlug) {
      const organizations = users.map((u) => ({
        id: u.organization.id,
        name: u.organization.name,
        slug: u.organization.slug,
      }));
      throw new BadRequestException({
        message: 'Multiple workspaces found for this email. Please select your workspace.',
        organizations,
        requiresOrganizationSlug: true,
      });
    }

    const user = users[0];

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive. Contact your administrator.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const activePlans = user.organization.subscriptions.flatMap((s) => s.activePlans);

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roleId: user.roleId,
      roleType: user.role.type,
      permissions: user.role.permissions,
      activePlans,
    });

    // Update refresh token hash and last login timestamp
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await bcrypt.hash(tokens.refreshToken, 10),
        lastLoginAt: new Date(),
      },
    });

    return {
      user: this.formatUserSummary(user, user.role, user.organization, activePlans),
      tokens,
    };
  }

  /**
   * Rotate access and refresh tokens.
   */
  async refreshTokens(dto: RefreshTokenDto): Promise<AuthTokens> {
    if (!dto.refreshToken) {
      throw new BadRequestException('refreshToken is required via body or query parameter');
    }

    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET is not configured');
    }

    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify<JwtRefreshPayload>(dto.refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        role: true,
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            },
          },
        },
      },
    });

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    // Verify refresh token hash
    const isTokenMatch = await bcrypt.compare(
      dto.refreshToken,
      user.refreshTokenHash,
    );
    if (!isTokenMatch) {
      // Possible token reuse attack: revoke refresh token
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException('Access denied: Token revoked');
    }

    const activePlans = user.organization.subscriptions.flatMap((s) => s.activePlans);

    // Generate new pair
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      organizationId: user.organizationId,
      roleId: user.roleId,
      roleType: user.role.type,
      permissions: user.role.permissions,
      activePlans,
    });

    // Update stored refresh token hash
    await this.updateRefreshTokenHash(user.id, tokens.refreshToken);

    return tokens;
  }

  /**
   * Logout user by clearing refresh token hash.
   */
  async logout(
    userId: string,
    allDevices?: boolean,
  ): Promise<{ message: string; allDevices: boolean }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return {
      message: 'Logged out successfully',
      allDevices: allDevices ?? false,
    };
  }

  /**
   * Get current authenticated user details.
   */
  async getMe(
    userId: string,
    options?: { includePermissions?: boolean; includeOrg?: boolean },
  ): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        organization: {
          include: {
            subscriptions: {
              where: { status: { in: ['ACTIVE', 'TRIALING'] } },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activePlans = user.organization.subscriptions.flatMap((s) => s.activePlans);
    const summary = this.formatUserSummary(user, user.role, user.organization, activePlans);

    if (options?.includePermissions === false) {
      summary.role.permissions = [];
    }

    return summary;
  }

  /**
   * Helper to generate Access and Refresh JWT tokens.
   */
  private async generateTokens(payload: JwtPayload): Promise<AuthTokens> {
    const accessSecret = this.configService.get<string>('JWT_SECRET');
    const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';

    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secrets are not configured properly');
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as any,
      }),
      this.jwtService.signAsync(
        { sub: payload.sub, organizationId: payload.organizationId },
        {
          secret: refreshSecret,
          expiresIn: refreshExpiresIn as any,
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }

  /**
   * Helper to store hashed refresh token for revocation support.
   */
  private async updateRefreshTokenHash(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: hash },
    });
  }

  /**
   * Format UserSummary object.
   */
  private formatUserSummary(
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      avatarUrl: string | null;
    },
    role: {
      id: string;
      name: string;
      type: string;
      permissions: string[];
    },
    organization: {
      id: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      website: string | null;
      sourcingChannels: string[];
    },
    activePlans: AppPlan[],
  ): UserSummary {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: {
        id: role.id,
        name: role.name,
        type: role.type,
        permissions: role.permissions,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logoUrl: organization.logoUrl,
        website: organization.website,
        sourcingChannels: organization.sourcingChannels,
        activePlans,
      },
    };
  }

  /**
   * Get organization details for the authenticated user's organization.
   */
  async getOrganization(userId: string): Promise<OrganizationDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      include: {
        _count: {
          select: {
            users: true,
            jobs: true,
            candidates: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  /**
   * Update organization details (Super Admin / Admin only).
   */
  async updateOrganization(
    userId: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user has admin/super-admin privileges
    const allowedRoles: string[] = [SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN];
    if (!allowedRoles.includes(user.role.type)) {
      throw new ForbiddenException(
        'Only Super Admin or Admin can edit organization settings.',
      );
    }

    // If changing slug, verify availability
    if (dto.slug) {
      const cleanSlug = dto.slug.toLowerCase().trim();
      if (RESERVED_SYSTEM_SLUGS.has(cleanSlug)) {
        throw new BadRequestException('This slug is reserved by the platform');
      }

      const existingOrg = await this.prisma.organization.findUnique({
        where: { slug: cleanSlug },
      });

      if (existingOrg && existingOrg.id !== user.organizationId) {
        throw new ConflictException(
          `Workspace slug '${cleanSlug}' is already taken by another organization.`,
        );
      }
    }

    const updatedOrg = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.slug ? { slug: dto.slug.toLowerCase().trim() } : {}),
        ...(dto.website !== undefined ? { website: dto.website ? dto.website.trim() : null } : {}),
        ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl ? dto.logoUrl.trim() : null } : {}),
        ...(dto.sourcingChannels ? { sourcingChannels: dto.sourcingChannels } : {}),
      },
      include: {
        _count: {
          select: {
            users: true,
            jobs: true,
            candidates: true,
          },
        },
      },
    });

    return updatedOrg;
  }

  /**
   * Upload and attach organization logo image file
   */
  async uploadOrganizationLogo(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ logoUrl: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.organizationId) {
      throw new NotFoundException('User or organization not found');
    }

    const allowedRoles: string[] = [SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN];
    if (
      !user.role ||
      (!allowedRoles.includes(user.role.type) &&
        user.role.name !== 'Super Admin' &&
        user.role.name !== 'Admin')
    ) {
      throw new ForbiddenException(
        'Only Super Admins or Admins can upload organization logo',
      );
    }

    if (!file || !file.buffer) {
      throw new BadRequestException('No logo image file uploaded');
    }

    let processedBuffer = file.buffer;
    try {
      const trimmed = await sharp(file.buffer).trim({ threshold: 15 }).toBuffer();
      if (trimmed && trimmed.length > 0) {
        processedBuffer = trimmed;
      }
    } catch {
      processedBuffer = file.buffer;
    }

    const ext = file.originalname ? file.originalname.split('.').pop() : 'png';
    const key = `logos/${user.organizationId}-${Date.now()}.${ext}`;

    const storage = this.storageService || new StorageService(this.configService);
    const { url } = await storage.uploadBuffer({
      key,
      buffer: processedBuffer,
      contentType: file.mimetype || 'image/png',
    });

    await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: { logoUrl: url },
    });

    return { logoUrl: url };
  }

  /**
   * Request password reset token and dispatch email instructions.
   * Always responds with success to prevent user account enumeration.
   */
  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();
    const whereClause: { email: string; organizationId?: string } = { email };

    if (dto.organizationSlug) {
      const org = await this.prisma.organization.findUnique({
        where: { slug: dto.organizationSlug.toLowerCase().trim() },
        select: { id: true },
      });
      if (org) {
        whereClause.organizationId = org.id;
      }
    }

    const user = await this.prisma.user.findFirst({
      where: whereClause,
      include: { organization: { select: { name: true } } },
    });

    if (user && user.isActive) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: resetExpires,
        },
      });

      const frontendUrl = this.configService.get<string>('APP_URL') || 'http://localhost:5173';
      const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;
      const companyName = user.organization?.name || 'ATS Platform';

      const emailService = this.emailService || new EmailService();
      await emailService.sendMail({
        to: user.email,
        subject: `Password Reset Request - ${companyName}`,
        text: `You recently requested to reset your password for ${companyName}. Click the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0;">
            <h2 style="color: #0f172a; margin-bottom: 16px;">Password Reset Request</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              Hello <strong>${user.firstName}</strong>,
            </p>
            <p style="color: #475569; font-size: 15px; line-height: 1.6;">
              We received a request to reset your password for your <strong>${companyName}</strong> account.
            </p>
            <div style="margin: 28px 0; text-align: center;">
              <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block; font-size: 15px;">
                Reset Password
              </a>
            </div>
            <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
              This link is valid for <strong>1 hour</strong>. If you did not make this request, you can safely ignore this email; your account remains secure.
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px;">
              Button not working? Copy and paste this URL into your browser:<br/>
              <a href="${resetLink}" style="color: #4f46e5; word-break: break-all;">${resetLink}</a>
            </p>
          </div>
        `,
      });
    }

    return {
      message: 'If an account exists with that email, password reset instructions have been dispatched.',
    };
  }

  /**
   * Reset user password using a valid, unexpired reset token.
   * Revokes all active refresh tokens for security.
   */
  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const hashedToken = crypto.createHash('sha256').update(dto.token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        resetPasswordToken: hashedToken,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
        refreshTokenHash: null, // Revokes active session on all devices
      },
    });

    return {
      message: 'Your password has been successfully reset. Please log in with your new credentials.',
    };
  }

  /**
   * Get all active roles available for user's organization
   */
  async getOrganizationRoles(userId: string): Promise<OrganizationRole[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const roles = await this.prisma.role.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type,
      permissions: r.permissions,
      isSystem: r.isSystem,
    }));
  }

  /**
   * List all team members in user's organization
   */
  async getOrganizationMembers(userId: string): Promise<OrganizationMember[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const members = await this.prisma.user.findMany({
      where: { organizationId: user.organizationId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      email: m.email,
      phone: m.phone,
      avatarUrl: m.avatarUrl,
      isActive: m.isActive,
      lastLoginAt: m.lastLoginAt,
      createdAt: m.createdAt,
      role: m.role,
    }));
  }

  /**
   * Add a new member to the organization with role and credentials
   */
  async addOrganizationMember(
    requesterId: string,
    dto: AddMemberDto,
  ): Promise<OrganizationMember> {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      include: { role: true, organization: true },
    });
    if (!requester) throw new NotFoundException('Requester not found');

    const allowedRoles: string[] = [SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN];
    if (
      !requester.role ||
      (!allowedRoles.includes(requester.role.type) &&
        requester.role.name !== 'Super Admin' &&
        requester.role.name !== 'Admin')
    ) {
      throw new ForbiddenException(
        'Only Super Admins or Admins can invite new team members to the organization.',
      );
    }

    const orgId = requester.organizationId;
    const cleanEmail = dto.email.toLowerCase().trim();

    // Check if user already exists in this organization
    const existing = await this.prisma.user.findUnique({
      where: {
        email_organizationId: {
          email: cleanEmail,
          organizationId: orgId,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `A team member with email '${cleanEmail}' already exists in ${requester.organization.name}.`,
      );
    }

    // Verify role belongs to this organization
    const targetRole = await this.prisma.role.findFirst({
      where: {
        id: dto.roleId,
        organizationId: orgId,
      },
    });
    if (!targetRole) {
      throw new BadRequestException('Selected role is invalid for this organization.');
    }

    // Verify organization seat capacity
    const [currentMembersCount, subscription] = await Promise.all([
      this.prisma.user.count({ where: { organizationId: orgId } }),
      this.prisma.subscription.findFirst({ where: { organizationId: orgId } }),
    ]);

    const maxUsers = subscription?.maxUsers || 25;
    if (currentMembersCount >= maxUsers) {
      throw new BadRequestException(
        `Seat limit reached (${currentMembersCount}/${maxUsers}). Please upgrade your subscription plan to add more members.`,
      );
    }

    // Determine initial password
    const rawPassword =
      dto.password?.trim() ||
      `${crypto.randomBytes(4).toString('hex')}A1!${crypto.randomBytes(3).toString('hex')}`;
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const created = await this.prisma.user.create({
      data: {
        organizationId: orgId,
        roleId: targetRole.id,
        email: cleanEmail,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone: dto.phone?.trim() || null,
        isActive: true,
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
          },
        },
      },
    });

    // Send invitation email
    const frontendUrl = this.configService.get<string>('APP_URL') || 'http://localhost:5173';
    const loginUrl = `${frontendUrl}/login?organizationSlug=${requester.organization.slug}`;
    const emailService = this.emailService || new EmailService();

    void emailService.sendMail({
      to: cleanEmail,
      subject: `You have been invited to join ${requester.organization.name} on ATS`,
      text: `Hello ${created.firstName},\n\nYou have been invited to join ${requester.organization.name} as a ${targetRole.name}.\n\nOrganization: ${requester.organization.name} (@${requester.organization.slug})\nLogin Email: ${cleanEmail}\nTemporary Password: ${rawPassword}\n\nLogin URL: ${loginUrl}\n\nPlease change your password upon logging in.`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h2 style="color: #0f172a; margin-top: 0;">Welcome to ${requester.organization.name}</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            Hello <strong>${created.firstName}</strong>,
          </p>
          <p style="color: #475569; font-size: 15px; line-height: 1.6;">
            <strong>${requester.firstName} ${requester.lastName}</strong> has invited you to join the recruitment workspace for <strong>${requester.organization.name}</strong> as a <strong>${targetRole.name}</strong>.
          </p>
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 4px 0; color: #334155; font-size: 14px;"><strong>Organization:</strong> ${requester.organization.name} (@${requester.organization.slug})</p>
            <p style="margin: 4px 0; color: #334155; font-size: 14px;"><strong>Role:</strong> ${targetRole.name}</p>
            <p style="margin: 4px 0; color: #334155; font-size: 14px;"><strong>Email:</strong> ${cleanEmail}</p>
            <p style="margin: 4px 0; color: #334155; font-size: 14px;"><strong>Initial Password:</strong> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 14px;">${rawPassword}</code></p>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${loginUrl}" style="background-color: #0284c7; color: #ffffff; padding: 12px 28px; font-weight: 600; text-decoration: none; border-radius: 8px; display: inline-block; font-size: 15px;">
              Access ATS Workspace
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px;">For security, we recommend changing your password after your first login.</p>
        </div>
      `,
    }).catch(() => null);

    return {
      id: created.id,
      firstName: created.firstName,
      lastName: created.lastName,
      email: created.email,
      phone: created.phone,
      avatarUrl: created.avatarUrl,
      isActive: created.isActive,
      lastLoginAt: created.lastLoginAt,
      createdAt: created.createdAt,
      role: created.role,
    };
  }

  /**
   * Update an existing team member's role or status
   */
  async updateOrganizationMember(
    requesterId: string,
    memberId: string,
    dto: UpdateMemberDto,
  ): Promise<OrganizationMember> {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      include: { role: true },
    });
    if (!requester) throw new NotFoundException('Requester not found');

    const allowedRoles: string[] = [SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN];
    if (
      !requester.role ||
      (!allowedRoles.includes(requester.role.type) &&
        requester.role.name !== 'Super Admin' &&
        requester.role.name !== 'Admin')
    ) {
      throw new ForbiddenException('Only Super Admins or Admins can modify team members.');
    }

    if (requesterId === memberId && dto.isActive === false) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId: requester.organizationId },
      include: { role: true },
    });
    if (!member) {
      throw new NotFoundException('Team member not found in your organization.');
    }

    if (
      member.role.type === SystemRoleType.SUPER_ADMIN &&
      requester.role.type !== SystemRoleType.SUPER_ADMIN &&
      dto.roleId &&
      dto.roleId !== member.roleId
    ) {
      throw new ForbiddenException('Only a Super Admin can change another Super Admin role.');
    }

    if (dto.roleId) {
      const validRole = await this.prisma.role.findFirst({
        where: { id: dto.roleId, organizationId: requester.organizationId },
      });
      if (!validRole) {
        throw new BadRequestException('Invalid role specified for this organization.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: memberId },
      data: {
        ...(dto.roleId ? { roleId: dto.roleId } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ? dto.phone.trim() : null } : {}),
      },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            type: true,
            description: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: updated.email,
      phone: updated.phone,
      avatarUrl: updated.avatarUrl,
      isActive: updated.isActive,
      lastLoginAt: updated.lastLoginAt,
      createdAt: updated.createdAt,
      role: updated.role,
    };
  }

  /**
   * Remove a member from the organization
   */
  async removeOrganizationMember(
    requesterId: string,
    memberId: string,
  ): Promise<{ message: string }> {
    const requester = await this.prisma.user.findUnique({
      where: { id: requesterId },
      include: { role: true },
    });
    if (!requester) throw new NotFoundException('Requester not found');

    const allowedRoles: string[] = [SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN];
    if (
      !requester.role ||
      (!allowedRoles.includes(requester.role.type) &&
        requester.role.name !== 'Super Admin' &&
        requester.role.name !== 'Admin')
    ) {
      throw new ForbiddenException('Only Super Admins or Admins can remove team members.');
    }

    if (requesterId === memberId) {
      throw new BadRequestException('You cannot remove yourself from the organization.');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId: requester.organizationId },
      include: { role: true },
    });
    if (!member) {
      throw new NotFoundException('Team member not found in your organization.');
    }

    if (member.role.type === SystemRoleType.SUPER_ADMIN) {
      throw new ForbiddenException('Super Admin account cannot be removed.');
    }

    try {
      await this.prisma.user.delete({
        where: { id: memberId },
      });
      return { message: 'Team member has been removed.' };
    } catch {
      await this.prisma.user.update({
        where: { id: memberId },
        data: { isActive: false, refreshTokenHash: null },
      });
      return { message: 'Team member has existing activity logs and has been deactivated.' };
    }
  }
}
