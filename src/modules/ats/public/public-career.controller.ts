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
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { PublicCareerService } from './public-career.service.js';
import { PublicApplyJobDto } from './dto/public-apply.dto.js';

@ApiTags('Public Careers')
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
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'List public jobs for company',
    description: 'Returns all published open jobs for an organization using its unique vanity slug.',
  })
  @ApiParam({ name: 'orgSlug', description: 'Organization vanity slug (e.g. acme-corp)', example: 'acme-corp' })
  @ApiResponse({ status: 200, description: 'List of published jobs retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Organization not found.' })
  async getPublicJobs(@Param('orgSlug') orgSlug: string) {
    return this.publicCareerService.getPublicJobs(orgSlug);
  }

  /**
   * Public endpoint to check if candidate with email has already applied to this job.
   */
  @Get(':orgSlug/:jobId/check-applied')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Check if candidate has already applied',
    description: 'Determines if a candidate email already submitted an active application for this job.',
  })
  @ApiParam({ name: 'orgSlug', description: 'Organization vanity slug', example: 'acme-corp' })
  @ApiParam({ name: 'jobId', description: 'Target job ID' })
  @ApiQuery({ name: 'email', description: 'Candidate email to check', required: false })
  @ApiResponse({ status: 200, description: 'Application check status returned.' })
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
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Get public job details',
    description: 'Retrieves public job posting details, department, requirements, and company profile.',
  })
  @ApiParam({ name: 'orgSlug', description: 'Organization vanity slug' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job details retrieved successfully.' })
  @ApiResponse({ status: 404, description: 'Job or organization not found.' })
  async getPublicJobDetails(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
  ) {
    return this.publicCareerService.getPublicJobDetails(orgSlug, jobId);
  }

  /**
   * Public endpoint for candidate direct application submission with resume upload.
   * Rate limited to 10 submissions per minute per IP to prevent spam and abuse.
   */
  @Post(':orgSlug/:jobId/apply')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Submit direct candidate application with resume upload',
    description: 'Submits a public job application with candidate metadata and uploaded resume (PDF/DOCX). Rate limited to 10 req/min per IP.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({ name: 'orgSlug', description: 'Organization vanity slug' })
  @ApiParam({ name: 'jobId', description: 'Job ID to apply for' })
  @ApiBody({
    description: 'Candidate application form data and resume document',
    schema: {
      type: 'object',
      required: ['firstName', 'lastName', 'email', 'file'],
      properties: {
        firstName: { type: 'string', example: 'Alex' },
        lastName: { type: 'string', example: 'Chen' },
        email: { type: 'string', format: 'email', example: 'alex.chen@example.com' },
        phone: { type: 'string', example: '+1-555-0199' },
        currentCompany: { type: 'string', example: 'Tech Innovations Inc.' },
        currentTitle: { type: 'string', example: 'Senior Backend Engineer' },
        linkedinUrl: { type: 'string', example: 'https://linkedin.com/in/alexchen' },
        githubUrl: { type: 'string', example: 'https://github.com/alexchen' },
        portfolioUrl: { type: 'string', example: 'https://alexchen.dev' },
        coverLetter: { type: 'string' },
        source: { type: 'string', example: 'CAREER_PORTAL' },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Resume document (PDF, DOC, DOCX up to 10MB)',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Application submitted and queued for ATS scoring.' })
  @ApiResponse({ status: 400, description: 'Validation failed or invalid file format.' })
  @ApiResponse({ status: 409, description: 'Candidate has already applied for this job.' })
  @ApiResponse({ status: 429, description: 'Too many requests. Rate limit exceeded.' })
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
   * Public Webhook/API endpoint for headless candidate ingestion from Google Forms / third-party boards
   * without requiring hardcoded jobId.
   */
  @Post(':orgSlug/ingest')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Direct candidate ingestion from Google Forms / external boards',
    description: 'Ingests applications programmatically and matches the candidate to the correct open job role automatically.',
  })
  @ApiParam({ name: 'orgSlug', description: 'Organization vanity slug' })
  @ApiResponse({ status: 201, description: 'Candidate ingested and routed to matching job pipeline.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  async ingestCandidateDirect(
    @Param('orgSlug') orgSlug: string,
    @Body() dto: Record<string, any>,
  ) {
    return this.publicCareerService.ingestCandidate(orgSlug, undefined, dto);
  }

  /**
   * Public Webhook/API endpoint for headless candidate ingestion from third-party boards
   * (e.g. LinkedIn Easy Apply, Naukri, Glassdoor, Unstop, Indeed API).
   */
  @Post(':orgSlug/:jobId/ingest')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Headless candidate ingestion from job portals',
    description: 'Ingests applications programmatically from integrated portals (LinkedIn, Naukri, Indeed, etc.).',
  })
  @ApiParam({ name: 'orgSlug', description: 'Organization vanity slug' })
  @ApiParam({ name: 'jobId', description: 'Job ID' })
  @ApiResponse({ status: 201, description: 'Candidate ingested successfully.' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
  async ingestCandidate(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
    @Body() dto: Record<string, any>,
  ) {
    return this.publicCareerService.ingestCandidate(orgSlug, jobId, dto);
  }
}

