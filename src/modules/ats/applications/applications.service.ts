import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, ApplicationStatus, EntityPipelineType } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { PipelineStagesService } from '../jobs/pipeline-stages.service.js';
import { StageTransitionService } from '../../shared/pipelines/stage-transition.service.js';
import { CalendarService } from '../interviews/calendar.service.js';
import { ResumesService } from '../resumes/resumes.service.js';
import {
  RESUME_QUEUE,
  NOTIFICATION_QUEUE,
} from '../../shared/queue/queue.module.js';
import { CandidateNotificationWorker } from '../notifications/candidate-notification.worker.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { QueryApplicationsDto } from './dto/query-applications.dto.js';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CandidatesService)
    private readonly candidatesService: CandidatesService,
    @Inject(PipelineStagesService)
    private readonly pipelineStagesService: PipelineStagesService,
    @Inject(StageTransitionService)
    private readonly stageTransitionService: StageTransitionService,
    @Optional() @Inject(CalendarService) private readonly calendarService?: CalendarService,
    @Optional() @Inject(ResumesService) private readonly resumesService?: ResumesService,
    @Optional() @InjectQueue(RESUME_QUEUE) private readonly resumeQueue?: Queue,
    @Optional()
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue?: Queue,
    @Optional()
    @Inject(CandidateNotificationWorker)
    private readonly notificationWorker?: CandidateNotificationWorker,
  ) {}

  /**
   * Submits a candidate application for a specific job and records initial stage transition.
   */
  async create(
    organizationId: string,
    dto: CreateApplicationDto,
    userId?: string,
  ) {
    const job = await this.prisma.job.findFirst({
      where: {
        id: dto.jobId,
        organizationId,
      },
      include: {
        pipelineStages: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID '${dto.jobId}' not found`);
    }

    if (job.status === 'CLOSED') {
      throw new BadRequestException('Cannot apply to a closed job posting');
    }

    let candidateId = dto.candidateId;
    let candidateRecord = null;

    if (candidateId) {
      candidateRecord = await this.prisma.candidate.findFirst({
        where: { id: candidateId, organizationId },
      });
      if (!candidateRecord) {
        throw new NotFoundException(
          `Candidate with ID '${candidateId}' not found in your organization`,
        );
      }
    } else if (dto.candidate) {
      candidateRecord = await this.candidatesService.findOrCreate(
        organizationId,
        dto.candidate,
      );
      candidateId = candidateRecord.id;
    } else {
      throw new BadRequestException(
        'Either candidateId or candidate details must be provided',
      );
    }

    // Check duplicate application
    const existing = await this.prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId: dto.jobId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Candidate has already submitted an application for this job',
      );
    }

    // Determine initial stage
    let currentStageId = dto.stageId;
    let initialStageName = 'Applied';

    if (currentStageId) {
      const matchingStage = job.pipelineStages.find(
        (s) => s.id === currentStageId,
      );
      if (!matchingStage) {
        throw new BadRequestException(
          `Stage ID '${currentStageId}' does not belong to this job pipeline`,
        );
      }
      initialStageName = matchingStage.name;
    } else {
      if (job.pipelineStages.length > 0) {
        currentStageId = job.pipelineStages[0].id;
        initialStageName = job.pipelineStages[0].name;
      } else {
        const createdStages =
          await this.pipelineStagesService.createStagesForJob(job.id);
        currentStageId = createdStages[0].id;
        initialStageName = createdStages[0].name;
      }
    }

    const effectiveSource = (dto.source || dto.utmSource || candidateRecord?.source || 'CAREER_PORTAL').toUpperCase().trim();

    const application = await this.prisma.application.create({
      data: {
        organizationId,
        jobId: dto.jobId,
        candidateId,
        currentStageId,
        coverLetter: dto.coverLetter,
        source: effectiveSource,
        utmSource: dto.utmSource ?? undefined,
        utmMedium: dto.utmMedium ?? undefined,
        utmCampaign: dto.utmCampaign ?? undefined,
        metadata: dto.metadata ?? undefined,
        status: ApplicationStatus.ACTIVE,
      },
      include: {
        candidate: true,
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            status: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
        },
        currentStage: true,
      },
    });

    // Record initial stage transition in audit log
    await this.stageTransitionService.recordTransition({
      organizationId,
      entityType: EntityPipelineType.APPLICATION,
      entityId: application.id,
      fromStageId: null,
      fromStageName: null,
      toStageId: currentStageId,
      toStageName: initialStageName,
      performedById: userId,
      notes: 'Initial application submission',
    });

    // If candidate has a resumeUrl/resumeKey, enqueue resume parsing job
    const resumeKey =
      (dto.metadata as Record<string, any>)?.resumeKey ||
      (candidateRecord?.resumeUrl?.includes('resumes/')
        ? 'resumes/' + candidateRecord.resumeUrl.split('resumes/')[1]
        : null);

    if (resumeKey && this.resumeQueue) {
      await this.resumeQueue.add('parse-resume', {
        organizationId,
        candidateId,
        jobId: dto.jobId,
        applicationId: application.id,
        resumeKey,
        resumeUrl: candidateRecord?.resumeUrl,
      });
    }

    // Dispatch candidate application receipt notification
    const companyName =
      (application.job as any)?.organization?.name || 'THRM Digital Marketing Agency';
    const notificationPayload = {
      applicationId: application.id,
      candidateId,
      candidateName: `${application.candidate.firstName} ${application.candidate.lastName}`.trim(),
      candidatePhone: application.candidate.phone,
      candidateEmail: application.candidate.email,
      jobId: dto.jobId,
      jobTitle: application.job.title,
      companyName,
      stageName: initialStageName,
      fromStageName: null,
    };

    if (this.notificationWorker) {
      void this.notificationWorker
        .dispatchCandidateStatusUpdate(notificationPayload)
        .catch((err) => this.logger.error(`Status update dispatch error: ${err.message}`, err.stack));
    } else if (this.notificationQueue) {
      await this.notificationQueue.add('send-candidate-status-update', notificationPayload).catch((err) => {
        this.logger.warn(`Queue dispatch failed: ${err.message}`);
      });
    }

    return application;
  }

  /**
   * Retrieves applications with filters by job, stage, status, candidate search, and pagination.
   */
  async findAll(organizationId: string, query: QueryApplicationsDto = {}) {
    const {
      jobId,
      stageId,
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'appliedAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.ApplicationWhereInput = {
      organizationId,
      ...(jobId && { jobId }),
      ...(stageId && { currentStageId: stageId }),
      ...(status && { status }),
      ...(search && {
        candidate: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { currentCompany: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const [total, applications] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          candidate: true,
          job: {
            select: {
              id: true,
              title: true,
              department: true,
              status: true,
            },
          },
          currentStage: true,
          interviews: {
            where: { status: 'SCHEDULED' },
            orderBy: { scheduledAt: 'asc' },
            take: 1,
          },
        },
      }),
    ]);

    return {
      data: applications,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  /**
   * Finds a single application by ID with complete candidate, job, and pipeline stage details.
   */
  async findOne(organizationId: string, applicationId: string) {
    const application = await this.prisma.application.findFirst({
      where: {
        id: applicationId,
        organizationId,
      },
      include: {
        candidate: true,
        job: {
          include: {
            pipelineStages: {
              orderBy: { order: 'asc' },
            },
          },
        },
        currentStage: true,
        interviews: {
          where: { status: 'SCHEDULED' },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Application with ID '${applicationId}' not found`,
      );
    }

    return application;
  }

  /**
   * Transitions an application to a new pipeline stage and records an immutable audit entry.
   */
  async moveToStage(
    organizationId: string,
    applicationId: string,
    targetStageId: string,
    rejectionReason?: string,
    userId?: string,
  ) {
    const application = await this.findOne(organizationId, applicationId);

    const targetStage = application.job.pipelineStages.find(
      (s) => s.id === targetStageId,
    );

    if (!targetStage) {
      throw new BadRequestException(
        `Stage ID '${targetStageId}' does not belong to job '${application.job.title}'`,
      );
    }

    let status = application.status;
    const stageNameLower = targetStage.name.toLowerCase();
    const currentStage = application.currentStage;
    const isTargetRejected = stageNameLower.includes('reject');

    // Enforce forward-only pipeline progression rule
    if (
      currentStage &&
      !isTargetRejected &&
      targetStage.order < currentStage.order
    ) {
      throw new BadRequestException(
        `Cannot move application backwards from '${currentStage.name}' to '${targetStage.name}'. Recruitment pipeline stages are one-directional.`,
      );
    }

    if (isTargetRejected) {
      status = ApplicationStatus.REJECTED;
    } else if (
      stageNameLower.includes('hired') ||
      stageNameLower.includes('hire')
    ) {
      status = ApplicationStatus.HIRED;
    } else if (
      status === ApplicationStatus.REJECTED ||
      status === ApplicationStatus.HIRED
    ) {
      status = ApplicationStatus.ACTIVE;
    }

    // Auto-create persistent reserved meeting room if transitioning to an interview stage
    const isInterviewStage =
      stageNameLower.includes('interview') ||
      stageNameLower.includes('technical') ||
      stageNameLower.includes('managerial') ||
      stageNameLower.includes('screening') ||
      stageNameLower.includes('hr');

    if (isInterviewStage) {
      try {
        const existingInterview = await this.prisma.interview.findFirst({
          where: {
            applicationId,
            organizationId,
            status: 'SCHEDULED',
          },
        });

        if (!existingInterview) {
          const cal = this.calendarService || new CalendarService();
          const scheduledDate = new Date(Date.now() + 24 * 3600 * 1000);
          const meetingLink = cal.generateGoogleMeetLink(applicationId);
          const googleCalendarHtmlLink = cal.generateGoogleCalendarWebLink({
            title: `${targetStage.name}: ${application.candidate.firstName} ${application.candidate.lastName} - ${application.job.title}`,
            description: `Interview stage for ${application.job.title}.\nCandidate: ${application.candidate.firstName} ${application.candidate.lastName} (${application.candidate.email})`,
            start: scheduledDate,
            durationMinutes: 45,
            meetingLink,
          });

          await this.prisma.interview.create({
            data: {
              organizationId,
              applicationId,
              candidateId: application.candidateId,
              jobId: application.jobId,
              interviewerId: userId || null,
              title: `${targetStage.name}: ${application.candidate.firstName} - ${application.job.title}`,
              type: stageNameLower.includes('system')
                ? 'SYSTEM_DESIGN'
                : stageNameLower.includes('manager')
                ? 'MANAGERIAL'
                : stageNameLower.includes('hr')
                ? 'HR_FINAL'
                : stageNameLower.includes('screen')
                ? 'SCREENING'
                : 'TECHNICAL',
              status: 'SCHEDULED',
              scheduledAt: scheduledDate,
              durationMinutes: 45,
              timezone: 'UTC',
              meetingLink,
              googleCalendarHtmlLink,
            },
          });
        }
      } catch (e) {
        // Safe fallback - do not block stage transition if interview creation encounters duplicate
      }
    }

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        currentStageId: targetStageId,
        status,
        ...(rejectionReason !== undefined && { rejectionReason }),
      },
      include: {
        candidate: true,
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            status: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
        },
        currentStage: true,
        interviews: {
          where: { status: 'SCHEDULED' },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
        },
      },
    });

    // Record stage transition audit log via generic service
    await this.stageTransitionService.recordTransition({
      organizationId,
      entityType: EntityPipelineType.APPLICATION,
      entityId: applicationId,
      fromStageId: application.currentStageId,
      fromStageName: application.currentStage.name,
      toStageId: targetStage.id,
      toStageName: targetStage.name,
      performedById: userId,
      reason: rejectionReason,
    });

    // Dispatch candidate status transition notification
    const companyName =
      (updated.job as any)?.organization?.name || 'THRM Digital Marketing Agency';
    const notificationPayload = {
      applicationId: updated.id,
      candidateId: updated.candidateId,
      candidateName: `${updated.candidate.firstName} ${updated.candidate.lastName}`.trim(),
      candidatePhone: updated.candidate.phone,
      candidateEmail: updated.candidate.email,
      jobId: updated.jobId,
      jobTitle: updated.job.title,
      companyName,
      stageName: targetStage.name,
      fromStageName: application.currentStage.name,
      rejectionReason,
    };

    if (this.notificationWorker) {
      void this.notificationWorker
        .dispatchCandidateStatusUpdate(notificationPayload)
        .catch((err) => this.logger.error(`Status update dispatch error: ${err.message}`, err.stack));
    } else if (this.notificationQueue) {
      await this.notificationQueue.add('send-candidate-status-update', notificationPayload).catch((err) => {
        this.logger.warn(`Queue dispatch failed: ${err.message}`);
      });
    }

    return updated;
  }

  /**
   * Retrieves the historical transition timeline for an application.
   */
  async getTimeline(organizationId: string, applicationId: string) {
    await this.findOne(organizationId, applicationId);

    return this.stageTransitionService.getEntityTimeline(
      organizationId,
      EntityPipelineType.APPLICATION,
      applicationId,
    );
  }

  /**
   * Retrieves ATS score details, skill match breakdown, and AI detection report for an application.
   */
  async getAtsScore(organizationId: string, applicationId: string) {
    const app = await this.findOne(organizationId, applicationId);
    const metadata = (app.metadata as Record<string, any>) || {};

    return {
      applicationId: app.id,
      candidate: {
        id: app.candidate.id,
        name: `${app.candidate.firstName} ${app.candidate.lastName}`,
        email: app.candidate.email,
        skills: app.candidate.skills,
      },
      job: {
        id: app.job.id,
        title: app.job.title,
      },
      atsScore: app.atsScore,
      status: app.status,
      rejectionReason: app.rejectionReason,
      atsScoreBreakdown: metadata.atsScoreBreakdown || null,
      aiDetection: metadata.aiDetection || null,
      parsedResume: metadata.parsedResume || null,
    };
  }

  /**
   * Re-triggers ATS parsing, AI detection, and scoring for an application.
   * Uses BullMQ queue when Redis is available; falls back to inline synchronous scoring otherwise.
   */
  async reparseApplication(organizationId: string, applicationId: string) {
    const app = await this.findOne(organizationId, applicationId);
    const metadata = (app.metadata as Record<string, any>) || {};

    const resumeKey =
      metadata.resumeKey ||
      (app.candidate.resumeUrl?.includes('resumes/')
        ? app.candidate.resumeUrl.split('storage/')[1] || app.candidate.resumeUrl
        : null);

    if (!resumeKey && !app.candidate.resumeUrl?.includes('drive.google.com')) {
      if (app.candidate.resumeUrl?.startsWith('http') && !app.candidate.resumeUrl.includes('resumes/')) {
        throw new BadRequestException(
          'Cannot run AI scoring on external URLs. Please upload a physical PDF or Word document to enable AI ATS matching.',
        );
      }

      throw new BadRequestException(
        'No resume file found for this application or candidate. Please upload a resume first.',
      );
    }

    const effectiveResumeKey =
      resumeKey ||
      (app.candidate.resumeUrl?.includes('drive.google.com') ? 'google-drive-link' : '');

    // Try BullMQ queue first
    let queuedSuccessfully = false;
    if (this.resumeQueue) {
      try {
        await this.resumeQueue.add('parse-resume', {
          organizationId,
          candidateId: app.candidateId,
          jobId: app.jobId,
          applicationId: app.id,
          resumeKey: effectiveResumeKey,
          resumeUrl: app.candidate.resumeUrl,
        });
        queuedSuccessfully = true;
        this.logger.log(`Reparse queued via BullMQ for application ${applicationId}`);
      } catch (queueErr: any) {
        this.logger.warn(
          `BullMQ queue unavailable on reparse (${queueErr.message}). Running inline scoring fallback.`,
        );
      }
    }

    // Inline fallback when queue is unavailable
    if (!queuedSuccessfully && this.resumesService) {
      this.logger.log(`Running inline reparse for application ${applicationId}`);
      this.resumesService
        .runInlineScoring({
          organizationId,
          resumeKey: effectiveResumeKey,
          resumeUrl: app.candidate.resumeUrl ?? undefined,
          candidateId: app.candidateId,
          applicationId: app.id,
        })
        .catch((err: any) =>
          this.logger.error(`Inline reparse error for application ${applicationId}: ${err.message}`, err.stack),
        );
    } else if (!queuedSuccessfully) {
      throw new BadRequestException(
        'Resume queue is currently unavailable and inline scoring service could not be initialised.',
      );
    }

    return {
      message: queuedSuccessfully
        ? 'Resume parsing and AI analysis enqueued successfully'
        : 'Resume parsing started (inline mode — Redis unavailable)',
      applicationId: app.id,
    };
  }

  /**
   * Updates application status directly (e.g. WITHDRAWN, REJECTED, HIRED).
   */
  async updateStatus(
    organizationId: string,
    applicationId: string,
    status: ApplicationStatus,
    rejectionReason?: string,
  ) {
    await this.findOne(organizationId, applicationId);

    const updated = await this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status,
        ...(rejectionReason !== undefined && { rejectionReason }),
      },
      include: {
        candidate: true,
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            status: true,
            organization: {
              select: {
                name: true,
              },
            },
          },
        },
        currentStage: true,
      },
    });

    // Dispatch candidate status transition notification
    const companyName =
      (updated.job as any)?.organization?.name || 'THRM Digital Marketing Agency';
    const notificationPayload = {
      applicationId: updated.id,
      candidateId: updated.candidateId,
      candidateName: `${updated.candidate.firstName} ${updated.candidate.lastName}`.trim(),
      candidatePhone: updated.candidate.phone,
      candidateEmail: updated.candidate.email,
      jobId: updated.jobId,
      jobTitle: updated.job.title,
      companyName,
      stageName: status,
      rejectionReason,
    };

    if (this.notificationWorker) {
      void this.notificationWorker
        .dispatchCandidateStatusUpdate(notificationPayload)
        .catch((err) => this.logger.error(`Status update dispatch error: ${err.message}`, err.stack));
    } else if (this.notificationQueue) {
      await this.notificationQueue.add('send-candidate-status-update', notificationPayload).catch((err) => {
        this.logger.warn(`Queue dispatch failed: ${err.message}`);
      });
    }

    return updated;
  }

  /**
   * Removes an application record.
   */
  async remove(organizationId: string, applicationId: string) {
    await this.findOne(organizationId, applicationId);

    await this.prisma.application.delete({
      where: { id: applicationId },
    });

    return {
      message: 'Application deleted successfully',
      id: applicationId,
    };
  }
}
