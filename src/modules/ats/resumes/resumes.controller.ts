import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Inject,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../../common/guards/plan.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ResumesService, UploadedResumeFile } from './resumes.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { GetPresignedUrlDto } from './dto/get-presigned-url.dto.js';
import { AttachResumeDto } from './dto/attach-resume.dto.js';
import type { Request } from 'express';

@Controller('ats/resumes')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.ATS)
export class ResumesController {
  constructor(
    @Inject(ResumesService) private readonly resumesService: ResumesService,
    @Inject(StorageService) private readonly storageService: StorageService,
  ) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('resumes:upload')
  getPresignedUploadUrl(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: GetPresignedUrlDto,
  ) {
    return this.resumesService.getPresignedUploadUrl(orgId, dto);
  }

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('resumes:upload')
  uploadDirect(
    @CurrentUser('organizationId') orgId: string,
    @UploadedFile() file: UploadedResumeFile,
    @Body('candidateId') candidateId?: string,
    @Body('jobId') jobId?: string,
    @Body('applicationId') applicationId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.resumesService.uploadDirect(
      orgId,
      file,
      candidateId,
      jobId,
      applicationId,
    );
  }

  @Get('download-url')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('resumes:read')
  getDownloadUrl(
    @CurrentUser('organizationId') orgId: string,
    @Query('key') key: string,
  ) {
    if (!key) {
      throw new BadRequestException('Query parameter "key" is required');
    }
    return this.resumesService.getDownloadUrl(orgId, key);
  }

  @Post('attach')
  @HttpCode(HttpStatus.OK)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('resumes:upload')
  attachResume(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: AttachResumeDto,
  ) {
    return this.resumesService.attachResume(orgId, dto);
  }

  @Post('re-extract-all')
  @HttpCode(HttpStatus.OK)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('resumes:upload')
  reExtractAllCandidateSkills(
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.resumesService.reExtractAllCandidateSkills(orgId);
  }

  /**
   * Local-Safe Mock PUT Handler for Local Development testing.
   */
  @Put('local-upload')
  @HttpCode(HttpStatus.OK)
  async localUploadHandler(
    @Query('key') key: string,
    @Req() req: Request,
  ) {
    if (!key) {
      throw new BadRequestException('Missing key parameter');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return this.storageService.uploadBuffer({
      key,
      buffer,
      contentType: req.headers['content-type'] as string,
    });
  }
}
