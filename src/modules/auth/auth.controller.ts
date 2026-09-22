import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberDto } from './dto/update-member.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  AuthResponse,
  AuthTokens,
  UserSummary,
  OrganizationDetail,
  OrganizationRole,
  OrganizationMember,
} from './interfaces/auth-response.interface.js';

@ApiTags('Authentication & Organization')
@ApiBearerAuth('JWT-auth')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  /**
   * Check organization slug availability
   * Example: GET /api/v1/auth/check-slug?slug=acme-tech
   */
  @Public()
  @Get('check-slug')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check organization slug availability' })
  async checkSlug(
    @Query('slug') slug: string,
  ): Promise<{ slug: string; available: boolean }> {
    return this.authService.checkSlugAvailability(slug);
  }

  /**
   * Register Organization & Owner
   * Example: POST /api/v1/auth/register?plan=ATS
   */
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new tenant organization and owner user' })
  @ApiResponse({ status: 201, description: 'Registration successful.' })
  @ApiResponse({ status: 409, description: 'Slug or email already in use.' })
  async register(
    @Body() dto: RegisterDto,
    @Query('plan') plan?: string,
  ): Promise<AuthResponse> {
    return this.authService.register(dto, plan);
  }

  /**
   * Login with Email and Password
   * Example: POST /api/v1/auth/login?organizationSlug=acme-tech
   */
  @Public()
  @Post('login')
  @Throttle({ default: { limit: 25, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, returns JWT tokens.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  async login(
    @Body() dto: LoginDto,
    @Query('organizationSlug') queryOrgSlug?: string,
  ): Promise<AuthResponse> {
    const finalDto = {
      ...dto,
      organizationSlug: dto.organizationSlug || queryOrgSlug,
    };
    return this.authService.login(finalDto);
  }

  /**
   * Request password reset instructions
   * Example: POST /api/v1/auth/forgot-password
   */
  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset token sent via email' })
  @ApiResponse({ status: 200, description: 'Reset request received; instructions dispatched if account exists.' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  /**
   * Reset user password using token
   * Example: POST /api/v1/auth/reset-password
   */
  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset account password with a valid reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successful.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token.' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  /**
   * Rotate and issue fresh Access and Refresh Token pair
   * Example: POST /api/v1/auth/refresh?refreshToken=...
   */
  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT access token using valid refresh token' })
  async refresh(
    @Body() bodyDto: Partial<RefreshTokenDto>,
    @Query('refreshToken') queryRefreshToken?: string,
  ): Promise<AuthTokens> {
    const token = bodyDto?.refreshToken || queryRefreshToken || '';
    return this.authService.refreshTokens({ refreshToken: token });
  }

  /**
   * Logout user and revoke active refresh token
   * Example: POST /api/v1/auth/logout?allDevices=true
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user and revoke refresh token' })
  async logout(
    @CurrentUser('userId') userId: string,
    @Query('allDevices') allDevices?: string,
  ): Promise<{ message: string; allDevices: boolean }> {
    const isAll = allDevices === 'true' || allDevices === '1';
    return this.authService.logout(userId, isAll);
  }

  /**
   * Get authenticated user profile, permissions, and active organization plans
   * Example: GET /api/v1/auth/me?includePermissions=true
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get profile and permissions of authenticated user' })
  async getMe(
    @CurrentUser('userId') userId: string,
    @Query('includePermissions') includePermissions?: string,
  ): Promise<UserSummary> {
    const shouldIncludePermissions =
      includePermissions === undefined ||
      includePermissions === 'true' ||
      includePermissions === '1';
    return this.authService.getMe(userId, {
      includePermissions: shouldIncludePermissions,
    });
  }

  /**
   * Get current user's organization profile and stats
   * Example: GET /api/v1/auth/organization
   */
  @Get('organization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current tenant organization profile' })
  async getOrganization(
    @CurrentUser('userId') userId: string,
  ): Promise<OrganizationDetail> {
    return this.authService.getOrganization(userId);
  }

  /**
   * Update organization details (Super Admin / Admin only)
   * Example: PATCH /api/v1/auth/organization
   */
  @Patch('organization')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update tenant organization settings' })
  async updateOrganization(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<OrganizationDetail> {
    return this.authService.updateOrganization(userId, dto);
  }

  /**
   * Upload organization logo image (Super Admin / Admin only)
   * Example: POST /api/v1/auth/organization/logo
   */
  @Post('organization/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload organization logo image' })
  @ApiConsumes('multipart/form-data')
  async uploadOrganizationLogo(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ logoUrl: string }> {
    return this.authService.uploadOrganizationLogo(userId, file);
  }

  /**
   * Get all active roles available within the user's organization
   * Example: GET /api/v1/auth/organization/roles
   */
  @Get('organization/roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get roles available in tenant organization' })
  async getOrganizationRoles(
    @CurrentUser('userId') userId: string,
  ): Promise<OrganizationRole[]> {
    return this.authService.getOrganizationRoles(userId);
  }

  /**
   * Get all team members in the user's organization
   * Example: GET /api/v1/auth/organization/members
   */
  @Get('organization/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all team members belonging to this organization' })
  async getOrganizationMembers(
    @CurrentUser('userId') userId: string,
  ): Promise<OrganizationMember[]> {
    return this.authService.getOrganizationMembers(userId);
  }

  /**
   * Add / invite a new team member to the organization (Super Admin / Admin only)
   * Example: POST /api/v1/auth/organization/members
   */
  @Post('organization/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a new team member to the organization' })
  async addOrganizationMember(
    @CurrentUser('userId') userId: string,
    @Body() dto: AddMemberDto,
  ): Promise<OrganizationMember> {
    return this.authService.addOrganizationMember(userId, dto);
  }

  /**
   * Update team member role or active status (Super Admin / Admin only)
   * Example: PATCH /api/v1/auth/organization/members/:id
   */
  @Patch('organization/members/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update organization member role or active status' })
  async updateOrganizationMember(
    @CurrentUser('userId') userId: string,
    @Param('id') memberId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<OrganizationMember> {
    return this.authService.updateOrganizationMember(userId, memberId, dto);
  }

  /**
   * Remove a team member from the organization (Super Admin / Admin only)
   * Example: DELETE /api/v1/auth/organization/members/:id
   */
  @Delete('organization/members/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  async removeOrganizationMember(
    @CurrentUser('userId') userId: string,
    @Param('id') memberId: string,
  ): Promise<{ message: string }> {
    return this.authService.removeOrganizationMember(userId, memberId);
  }
}

