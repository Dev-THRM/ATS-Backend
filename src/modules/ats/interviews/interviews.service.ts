import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, InterviewStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { CalendarService } from './calendar.service.js';
import { NOTIFICATION_QUEUE } from '../../shared/queue/queue.module.js';
import { CreateInterviewDto } from './dto/create-interview.dto.js';
import { UpdateInterviewDto } from './dto/update-interview.dto.js';
import { QueryInterviewsDto } from './dto/query-interviews.dto.js';
import { SubmitInterviewFeedbackDto } from './dto/submit-feedback.dto.js';

@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CalendarService) private readonly calendarService: CalendarService,
    @Optional()
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue?: Queue,
  ) {}

  /**
   * Schedules a new interview, generates automated Google Meet link, and enqueues WhatsApp invite + 1-day reminder.
   */
  async create(organizationId: string, dto: CreateInterviewDto, userId?: string) {
    const application = await this.prisma.application.findFirst({
      where: {
        id: dto.applicationId,
        organizationId,
      },
      include: {
        candidate: true,
        job: {
          include: {
            organization: true,
          },
        },
        currentStage: true,
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Application with ID '${dto.applicationId}' not found in your organization`,
      );
    }

    const scheduledDate = new Date(dto.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date format');
    }

    // 1. Generate automated Google Meet link if not provided
    const meetingLink =
      dto.meetingLink && dto.meetingLink.trim() !== ''
        ? dto.meetingLink.trim()
        : this.calendarService.generateGoogleMeetLink(dto.applicationId);

    // 2. Generate 1-click Google Calendar Web Add Link
    const googleCalendarHtmlLink = this.calendarService.generateGoogleCalendarWebLink({
      title: `${dto.title} - ${application.candidate.firstName} ${application.candidate.lastName}`,
      description: `Interview for ${application.job.title} at ${application.job.organization?.name || 'Our Company'}.\nCandidate: ${application.candidate.firstName} ${application.candidate.lastName} (${application.candidate.email})`,
      start: scheduledDate,
      durationMinutes: dto.durationMinutes || 45,
      meetingLink,
    });

    // 3. Persist Interview record
    const interview = await this.prisma.interview.create({
      data: {
        organizationId,
        applicationId: application.id,
        candidateId: application.candidateId,
        jobId: application.jobId,
        interviewerId: dto.interviewerId || userId || null,
        title: dto.title,
        type: dto.type,
        status: InterviewStatus.SCHEDULED,
        scheduledAt: scheduledDate,
        durationMinutes: dto.durationMinutes || 45,
        timezone: dto.timezone || 'UTC',
        meetingLink,
        googleCalendarHtmlLink,
        locationNotes: dto.locationNotes,
      },
      include: {
        candidate: true,
        job: true,
        interviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // 4. Enqueue Immediate WhatsApp Invitation Notification to candidate
    if (this.notificationQueue) {
      await this.notificationQueue.add('send-interview-invite', {
        interviewId: interview.id,
        applicationId: application.id,
        candidateId: application.candidateId,
        candidateName: `${application.candidate.firstName} ${application.candidate.lastName}`,
        candidatePhone: application.candidate.phone,
        candidateEmail: application.candidate.email,
        jobTitle: application.job.title,
        companyName: application.job.organization?.name || 'Our Company',
        interviewTitle: dto.title,
        scheduledAt: scheduledDate,
        durationMinutes: dto.durationMinutes || 45,
        meetingLink,
        type: 'INVITE',
      });

      // 5. Schedule 1-Day Pre-Interview Reminder (Delayed Job for 24h prior)
      const nowMs = Date.now();
      const scheduledMs = scheduledDate.getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const reminderTargetMs = scheduledMs - oneDayMs;
      const delayMs = reminderTargetMs - nowMs;

      if (delayMs > 0) {
        this.logger.log(
          `Scheduling 1-day WhatsApp reminder for interview ${interview.id} with delay ${Math.round(delayMs / 1000)}s`,
        );
        await this.notificationQueue.add(
          'send-interview-reminder',
          {
            interviewId: interview.id,
            applicationId: application.id,
            candidateId: application.candidateId,
            candidateName: `${application.candidate.firstName} ${application.candidate.lastName}`,
            candidatePhone: application.candidate.phone,
            candidateEmail: application.candidate.email,
            jobTitle: application.job.title,
            companyName: application.job.organization?.name || 'Our Company',
            interviewTitle: dto.title,
            scheduledAt: scheduledDate,
            durationMinutes: dto.durationMinutes || 45,
            meetingLink,
            type: 'REMINDER',
          },
          {
            delay: delayMs,
            jobId: `interview-reminder-${interview.id}`,
          },
        );
      }
    }

    return interview;
  }

  /**
   * Retrieves interviews filtered by job, candidate, interviewer, status, and date range.
   */
  async findAll(organizationId: string, query: QueryInterviewsDto = {}) {
    const {
      applicationId,
      candidateId,
      jobId,
      interviewerId,
      status,
      type,
      from,
      to,
      page = 1,
      limit = 20,
    } = query;

    const where: Prisma.InterviewWhereInput = {
      organizationId,
      ...(applicationId && { applicationId }),
      ...(candidateId && { candidateId }),
      ...(jobId && { jobId }),
      ...(interviewerId && { interviewerId }),
      ...(status && { status }),
      ...(type && { type }),
      ...(from || to
        ? {
            scheduledAt: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 20);
    const skip = (pageNum - 1) * limitNum;

    const [total, interviews] = await Promise.all([
      this.prisma.interview.count({ where }),
      this.prisma.interview.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { scheduledAt: 'asc' },
        include: {
          candidate: true,
          job: {
            select: {
              id: true,
              title: true,
              department: true,
            },
          },
          interviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
    ]);

    return {
      data: interviews,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  /**
   * Fetches single interview by ID.
   */
  async findOne(organizationId: string, interviewId: string) {
    const interview = await this.prisma.interview.findFirst({
      where: {
        id: interviewId,
        organizationId,
      },
      include: {
        candidate: true,
        job: {
          include: {
            organization: true,
          },
        },
        application: {
          include: {
            currentStage: true,
          },
        },
        interviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!interview) {
      throw new NotFoundException(`Interview with ID '${interviewId}' not found`);
    }

    return interview;
  }

  /**
   * Updates interview details (reschedule, update meeting link, etc.).
   */
  async update(
    organizationId: string,
    interviewId: string,
    dto: UpdateInterviewDto,
  ) {
    const existing = await this.findOne(organizationId, interviewId);

    const scheduledDate = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : existing.scheduledAt;

    const meetingLink =
      dto.meetingLink !== undefined ? dto.meetingLink : existing.meetingLink;

    const updated = await this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        ...(dto.interviewerId !== undefined && {
          interviewerId: dto.interviewerId,
        }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.scheduledAt !== undefined && { scheduledAt: scheduledDate }),
        ...(dto.durationMinutes !== undefined && {
          durationMinutes: dto.durationMinutes,
        }),
        ...(dto.timezone !== undefined && { timezone: dto.timezone }),
        ...(dto.meetingLink !== undefined && { meetingLink }),
        ...(dto.locationNotes !== undefined && {
          locationNotes: dto.locationNotes,
        }),
      },
      include: {
        candidate: true,
        job: true,
        interviewer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Records interviewer scorecard evaluation and marks interview as COMPLETED.
   */
  async submitFeedback(
    organizationId: string,
    interviewId: string,
    dto: SubmitInterviewFeedbackDto,
  ) {
    await this.findOne(organizationId, interviewId);

    return this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        feedbackRating: dto.rating,
        feedbackNotes: dto.notes,
        status: InterviewStatus.COMPLETED,
      },
      include: {
        candidate: true,
        job: true,
      },
    });
  }

  /**
   * Cancels a scheduled interview.
   */
  async cancel(organizationId: string, interviewId: string) {
    await this.findOne(organizationId, interviewId);

    return this.prisma.interview.update({
      where: { id: interviewId },
      data: {
        status: InterviewStatus.CANCELED,
      },
    });
  }

  /**
   * Deletes an interview record.
   */
  async remove(organizationId: string, interviewId: string) {
    await this.findOne(organizationId, interviewId);

    await this.prisma.interview.delete({
      where: { id: interviewId },
    });

    return { message: 'Interview deleted successfully' };
  }

  /**
   * Sweeps the database for any interviews scheduled in the next 24-36h that have not yet had a reminder sent.
   */
  async triggerDueReminders(organizationId?: string) {
    const now = new Date();
    const futureLimit = new Date(now.getTime() + 36 * 60 * 60 * 1000);

    const upcomingInterviews = await this.prisma.interview.findMany({
      where: {
        ...(organizationId && { organizationId }),
        status: InterviewStatus.SCHEDULED,
        reminderSent: false,
        scheduledAt: {
          gte: now,
          lte: futureLimit,
        },
      },
      include: {
        candidate: true,
        job: {
          include: {
            organization: true,
          },
        },
      },
    });

    let dispatched = 0;
    if (this.notificationQueue) {
      for (const interview of upcomingInterviews) {
        await this.notificationQueue.add('send-interview-reminder', {
          interviewId: interview.id,
          applicationId: interview.applicationId,
          candidateId: interview.candidateId,
          candidateName: `${interview.candidate.firstName} ${interview.candidate.lastName}`,
          candidatePhone: interview.candidate.phone,
          candidateEmail: interview.candidate.email,
          jobTitle: interview.job.title,
          companyName: interview.job.organization?.name || 'Our Company',
          interviewTitle: interview.title,
          scheduledAt: interview.scheduledAt,
          durationMinutes: interview.durationMinutes,
          meetingLink: interview.meetingLink || 'Google Meet',
          type: 'REMINDER',
        });
        dispatched++;
      }
    }

    return {
      totalFound: upcomingInterviews.length,
      dispatched,
    };
  }
}
