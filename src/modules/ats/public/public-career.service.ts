import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { JobStatus } from '@prisma/client';
import { PublicApplyJobDto } from './dto/public-apply.dto.js';

@Injectable()
export class PublicCareerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(ApplicationsService)
    private readonly applicationsService: ApplicationsService,
    @Inject(CandidatesService)
    private readonly candidatesService: CandidatesService,
  ) {}

  /**
   * Checks if a candidate with given email has already applied to a specific job.
   */
  async checkApplied(orgSlug: string, jobId: string, email?: string) {
    if (!email) {
      return { alreadyApplied: false };
    }

    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!org) {
      return { alreadyApplied: false };
    }

    const candidate = await this.prisma.candidate.findUnique({
      where: {
        email_organizationId: {
          email: email.toLowerCase().trim(),
          organizationId: org.id,
        },
      },
    });

    if (!candidate) {
      return { alreadyApplied: false };
    }

    const existingApp = await this.prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId,
        },
      },
      select: {
        id: true,
        appliedAt: true,
        status: true,
      },
    });

    if (existingApp) {
      return {
        alreadyApplied: true,
        appliedAt: existingApp.appliedAt,
        status: existingApp.status,
      };
    }

    return { alreadyApplied: false };
  }

  /**
   * Retrieves organization info and published open job postings for candidate public career page.
   */
  async getPublicJobs(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        website: true,
        isVerified: true,
        verifiedDomain: true,
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const jobs = await this.prisma.job.findMany({
      where: {
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
      select: {
        id: true,
        title: true,
        department: true,
        location: true,
        employmentType: true,
        experienceMin: true,
        experienceMax: true,
        experienceLevel: true,
        salaryMin: true,
        salaryMax: true,
        description: true,
        salaryCurrency: true,
        salaryVisible: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      organization: org,
      totalJobs: jobs.length,
      jobs,
    };
  }

  /**
   * Retrieves full public description for a single open job posting.
   */
  async getPublicJobDetails(orgSlug: string, jobId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        website: true,
        isVerified: true,
        verifiedDomain: true,
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job posting not found or no longer open`);
    }

    return {
      organization: org,
      job,
    };
  }

  /**
   * Allows public external candidates to submit an application with resume upload.
   */
  async applyPublic(
    orgSlug: string,
    jobId: string,
    dto: PublicApplyJobDto,
    file?: Express.Multer.File,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
    });

    if (!job) {
      throw new BadRequestException('Cannot apply: job is not currently open');
    }

    // Check duplicate application
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existingCandidate = await this.prisma.candidate.findUnique({
      where: {
        email_organizationId: {
          email: normalizedEmail,
          organizationId: org.id,
        },
      },
    });

    if (existingCandidate) {
      const existingApp = await this.prisma.application.findUnique({
        where: {
          candidateId_jobId: {
            candidateId: existingCandidate.id,
            jobId: job.id,
          },
        },
      });

      if (existingApp) {
        throw new ConflictException(
          'You have already submitted an application for this position. Multiple applications for the same role are not permitted.',
        );
      }
    }

    let resumeKey: string | null = null;
    let resumeUrl: string | null = null;

    if (file) {
      const sanitizedName = (file.originalname || 'resume.pdf').replace(
        /[^a-zA-Z0-9.-]/g,
        '_',
      );
      resumeKey = `resumes/${org.id}/public/${Date.now()}-${sanitizedName}`;
      const uploadResult = await this.storageService.uploadBuffer({
        key: resumeKey,
        buffer: file.buffer,
        contentType: file.mimetype,
        metadata: {
          organizationId: org.id,
          originalName: file.originalname,
          source: 'PUBLIC_CAREER_PORTAL',
        },
      });
      resumeUrl = uploadResult.url;
    }

    const effectiveSource = (dto.source || dto.utmSource || 'CAREER_PORTAL').toUpperCase().trim();

    // 1. Create or update candidate record with dynamic source attribution
    const candidate = await this.candidatesService.findOrCreate(org.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      currentCompany: dto.currentCompany,
      currentTitle: dto.currentTitle,
      location: dto.location,
      linkedinUrl: dto.linkedinUrl,
      portfolioUrl: dto.portfolioUrl,
      githubUrl: dto.githubUrl,
      skills: dto.skills || [],
      source: effectiveSource,
      resumeUrl: resumeUrl || undefined,
    });

    // 2. Submit application & trigger async BullMQ parser + candidate WhatsApp confirmation
    const application = await this.applicationsService.create(org.id, {
      jobId: job.id,
      candidateId: candidate.id,
      coverLetter: dto.coverLetter,
      source: effectiveSource,
      utmSource: dto.utmSource,
      utmMedium: dto.utmMedium,
      utmCampaign: dto.utmCampaign,
      metadata: {
        ...(resumeKey ? { resumeKey, resumeUrl } : {}),
        appliedVia: effectiveSource,
        sourceChannel: effectiveSource,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
      },
    });

    return {
      message: 'Application submitted successfully',
      applicationId: application.id,
      candidateId: candidate.id,
      jobTitle: job.title,
      source: effectiveSource,
    };
  }

  /**
   * Headless JSON candidate ingestion endpoint for third-party job boards & webhook integrations
   * (e.g. LinkedIn Easy Apply webhook, Naukri applicant integration, Unstop API).
   */
  async ingestCandidate(
    orgSlug: string,
    jobId: string,
    dto: PublicApplyJobDto & { resumeUrl?: string },
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
    });

    if (!job) {
      throw new BadRequestException('Cannot ingest: job is not currently open');
    }

    const effectiveSource = (dto.source || dto.utmSource || 'JOB_BOARD_WEBHOOK').toUpperCase().trim();

    // 1. Find or create candidate record
    const candidate = await this.candidatesService.findOrCreate(org.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      currentCompany: dto.currentCompany,
      currentTitle: dto.currentTitle,
      location: dto.location,
      linkedinUrl: dto.linkedinUrl,
      portfolioUrl: dto.portfolioUrl,
      githubUrl: dto.githubUrl,
      skills: dto.skills || [],
      source: effectiveSource,
      resumeUrl: dto.resumeUrl,
    });

    // 2. Submit application
    const application = await this.applicationsService.create(org.id, {
      jobId: job.id,
      candidateId: candidate.id,
      coverLetter: dto.coverLetter,
      source: effectiveSource,
      utmSource: dto.utmSource,
      utmMedium: dto.utmMedium,
      utmCampaign: dto.utmCampaign,
      metadata: {
        ...(dto.resumeUrl ? { resumeUrl: dto.resumeUrl } : {}),
        appliedVia: effectiveSource,
        sourceChannel: effectiveSource,
        ingestedVia: 'WEBHOOK_API',
      },
    });

    return {
      message: 'Candidate ingested successfully',
      applicationId: application.id,
      candidateId: candidate.id,
      jobTitle: job.title,
      source: effectiveSource,
    };
  }
}
