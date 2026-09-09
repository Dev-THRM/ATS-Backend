import {
  Controller,
  Post,
  Get,
  Patch,
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
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { UpdateOrganizationDto } from './dto/update-organization.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import {
  AuthResponse,
  AuthTokens,
  UserSummary,
} from './interfaces/auth-response.interface.js';

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
  @HttpCode(HttpStatus.OK)
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
  @HttpCode(HttpStatus.CREATED)
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
  @HttpCode(HttpStatus.OK)
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
   * Rotate and issue fresh Access and Refresh Token pair
   * Example: POST /api/v1/auth/refresh?refreshToken=...
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
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
  async getOrganization(
    @CurrentUser('userId') userId: string,
  ): Promise<any> {
    return this.authService.getOrganization(userId);
  }

  /**
   * Update organization details (Super Admin / Admin only)
   * Example: PATCH /api/v1/auth/organization
   */
  @Patch('organization')
  @HttpCode(HttpStatus.OK)
  async updateOrganization(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateOrganizationDto,
  ): Promise<any> {
    return this.authService.updateOrganization(userId, dto);
  }

  /**
   * Upload organization logo image (Super Admin / Admin only)
   * Example: POST /api/v1/auth/organization/logo
   */
  @Post('organization/logo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadOrganizationLogo(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ logoUrl: string }> {
    return this.authService.uploadOrganizationLogo(userId, file);
  }
}
