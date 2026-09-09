import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Prisma, JobStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { PipelineStagesService } from './pipeline-stages.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { QueryJobsDto } from './dto/query-jobs.dto.js';

@Injectable()
export class JobsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PipelineStagesService)
    private readonly pipelineStagesService: PipelineStagesService,
  ) {}

  /**
   * Creates a new job posting with an initialized pipeline template.
   */
  async create(organizationId: string, userId: string, dto: CreateJobDto) {
    if (
      dto.salaryMin !== undefined &&
      dto.salaryMax !== undefined &&
      dto.salaryMin > dto.salaryMax
    ) {
      throw new BadRequestException(
        'salaryMin cannot be greater than salaryMax',
      );
    }

    if (
      dto.experienceMin !== undefined &&
      dto.experienceMax !== undefined &&
      dto.experienceMin > dto.experienceMax
    ) {
      throw new BadRequestException(
        'experienceMin cannot be greater than experienceMax',
      );
    }

    const { pipelineStages: customStages, ...jobData } = dto;

    return this.prisma.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          ...jobData,
          description: jobData.description ?? '',
          organizationId,
          createdById: userId,
          salaryMin:
            jobData.salaryMin !== undefined
              ? new Prisma.Decimal(jobData.salaryMin)
              : null,
          salaryMax:
            jobData.salaryMax !== undefined
              ? new Prisma.Decimal(jobData.salaryMax)
              : null,
        },
      });

      const stages = await this.pipelineStagesService.createStagesForJob(
        job.id,
        customStages,
        tx,
      );

      return {
        ...job,
        pipelineStages: stages,
      };
    });
  }

  /**
   * Finds all jobs for an organization with filtering, pagination, and sorting.
   */
  async findAll(organizationId: string, query: QueryJobsDto = {}) {
    const {
      status,
      department,
      employmentType,
      experienceLevel,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.JobWhereInput = {
      organizationId,
      ...(status && { status }),
      ...(department && {
        department: { equals: department, mode: 'insensitive' },
      }),
      ...(employmentType && { employmentType }),
      ...(experienceLevel && { experienceLevel }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
          { department: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const [total, jobs] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          createdBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          _count: {
            select: {
              pipelineStages: true,
              applications: true,
            },
          },
        },
      }),
    ]);

    return {
      data: jobs,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  /**
   * Finds a specific job by ID with pipeline stages and creator details.
   */
  async findOne(organizationId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId,
      },
      include: {
        pipelineStages: {
          orderBy: { order: 'asc' },
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: {
            pipelineStages: true,
            applications: true,
          },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID '${jobId}' not found`);
    }

    return job;
  }

  /**
   * Updates an existing job posting.
   */
  async update(organizationId: string, jobId: string, dto: UpdateJobDto) {
    const existing = await this.findOne(organizationId, jobId);

    const salaryMin =
      dto.salaryMin !== undefined ? dto.salaryMin : Number(existing.salaryMin);
    const salaryMax =
      dto.salaryMax !== undefined ? dto.salaryMax : Number(existing.salaryMax);

    if (
      salaryMin !== null &&
      salaryMax !== null &&
      !isNaN(salaryMin) &&
      !isNaN(salaryMax) &&
      salaryMin > salaryMax
    ) {
      throw new BadRequestException(
        'salaryMin cannot be greater than salaryMax',
      );
    }

    const { pipelineStages: _stages, ...updateData } = dto;

    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        ...updateData,
        salaryMin:
          updateData.salaryMin !== undefined
            ? new Prisma.Decimal(updateData.salaryMin)
            : undefined,
        salaryMax:
          updateData.salaryMax !== undefined
            ? new Prisma.Decimal(updateData.salaryMax)
            : undefined,
      },
      include: {
        pipelineStages: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  /**
   * Updates the lifecycle status of a job (e.g. DRAFT -> OPEN / PUBLISHED, CLOSED).
   */
  async updateStatus(
    organizationId: string,
    jobId: string,
    status: JobStatus,
  ) {
    await this.findOne(organizationId, jobId);

    return this.prisma.job.update({
      where: { id: jobId },
      data: { status },
      include: {
        pipelineStages: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  /**
   * Deletes a job posting and its associated pipeline stages.
   */
  async remove(organizationId: string, jobId: string) {
    await this.findOne(organizationId, jobId);

    await this.prisma.job.delete({
      where: { id: jobId },
    });

    return {
      message: 'Job posting deleted successfully',
      id: jobId,
    };
  }

  /**
   * Generates channel-specific tracking links and share metadata for job posting.
   */
  async getShareLinks(organizationId: string, jobId: string) {
    const job = await this.findOne(organizationId, jobId);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, slug: true, sourcingChannels: true },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const channels = org.sourcingChannels?.length
      ? org.sourcingChannels
      : ['CAREER_PORTAL', 'LINKEDIN', 'NAUKRI', 'GLASSDOOR', 'UNSTOP', 'INDEED', 'WELLFOUND', 'REFERRAL'];

    const channelMetaMap: Record<string, { label: string; color: string }> = {
      CAREER_PORTAL: { label: 'Company Career Site', color: '#6366F1' },
      LINKEDIN: { label: 'LinkedIn Job Post / Ad', color: '#0A66C2' },
      NAUKRI: { label: 'Naukri.com Recruitment', color: '#1B69D0' },
      GLASSDOOR: { label: 'Glassdoor Jobs', color: '#0CAA41' },
      UNSTOP: { label: 'Unstop Campus / Lateral', color: '#7C3AED' },
      INDEED: { label: 'Indeed Apply Feed', color: '#2164F3' },
      WELLFOUND: { label: 'Wellfound (AngelList)', color: '#FF4D4D' },
      INTERNSHALA: { label: 'Internshala Hire', color: '#1295D8' },
      REFERRAL: { label: 'Employee Referral Link', color: '#F59E0B' },
      DIRECT_SOURCING: { label: 'Direct Sourcing Outreach', color: '#10B981' },
    };

    const links = channels.map((channel) => {
      const meta = channelMetaMap[channel] || {
        label: channel.replace(/_/g, ' '),
        color: '#64748B',
      };
      const queryParams = new URLSearchParams({
        source: channel,
        utm_source: channel.toLowerCase(),
        utm_medium: 'job_board',
        utm_campaign: job.title.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      });

      return {
        channel,
        label: meta.label,
        color: meta.color,
        applyUrl: `/careers/${org.slug}/apply/${job.id}?${queryParams.toString()}`,
        utmParams: {
          source: channel,
          utm_source: channel.toLowerCase(),
          utm_medium: 'job_board',
          utm_campaign: job.title.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        },
      };
    });

    return {
      jobId: job.id,
      jobTitle: job.title,
      organizationName: org.name,
      organizationSlug: org.slug,
      sourcingChannels: channels,
      links,
      socialShareText: `We're hiring a ${job.title} at ${org.name}! Apply now: `,
    };
  }
}
