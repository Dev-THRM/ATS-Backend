import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PublicCareerService } from './public-career.service.js';
import { PublicApplyJobDto } from './dto/public-apply.dto.js';

@Controller('ats/public/jobs')
export class PublicCareerController {
  constructor(
    @Inject(PublicCareerService)
    private readonly publicCareerService: PublicCareerService,
  ) {}

  /**
   * Public endpoint to list all open positions for an organization.
   */
  @Get(':orgSlug')
  async getPublicJobs(@Param('orgSlug') orgSlug: string) {
    return this.publicCareerService.getPublicJobs(orgSlug);
  }

  /**
   * Public endpoint to check if candidate with email has already applied to this job.
   */
  @Get(':orgSlug/:jobId/check-applied')
  async checkCandidateApplied(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
    @Query('email') email?: string,
  ) {
    return this.publicCareerService.checkApplied(orgSlug, jobId, email);
  }

  /**
   * Public endpoint to view a specific open job posting.
   */
  @Get(':orgSlug/:jobId')
  async getPublicJobDetails(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
  ) {
    return this.publicCareerService.getPublicJobDetails(orgSlug, jobId);
  }

  /**
   * Public endpoint for candidate direct application submission with resume upload.
   */
  @Post(':orgSlug/:jobId/apply')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async applyPublic(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
    @Body() dto: PublicApplyJobDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: true,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType: /(pdf|docx|msword|document)/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.publicCareerService.applyPublic(orgSlug, jobId, dto, file);
  }

  /**
   * Public Webhook/API endpoint for headless candidate ingestion from third-party boards
   * (e.g. LinkedIn Easy Apply, Naukri, Glassdoor, Unstop, Indeed API).
   */
  @Post(':orgSlug/:jobId/ingest')
  @HttpCode(HttpStatus.CREATED)
  async ingestCandidate(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
    @Body() dto: PublicApplyJobDto & { resumeUrl?: string },
  ) {
    return this.publicCareerService.ingestCandidate(orgSlug, jobId, dto);
  }
}
