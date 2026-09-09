import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATION_QUEUE } from '../../shared/queue/queue.module.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { WhatsAppTemplatesService } from './whatsapp-templates.service.js';
import { WhatsAppService } from './whatsapp.service.js';

export interface CandidateStatusUpdateJobData {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  jobId: string;
  jobTitle: string;
  companyName: string;
  stageName: string;
  fromStageName?: string | null;
  rejectionReason?: string | null;
  customNotes?: string | null;
  channel?: 'WHATSAPP' | 'EMAIL' | 'ALL';
}

export interface InterviewNotificationJobData {
  interviewId: string;
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  jobTitle: string;
  companyName: string;
  interviewTitle: string;
  scheduledAt: Date | string;
  durationMinutes: number;
  meetingLink: string;
  type: 'INVITE' | 'REMINDER';
}

@Processor(NOTIFICATION_QUEUE)
export class CandidateNotificationWorker extends WorkerHost {
  private readonly logger = new Logger(CandidateNotificationWorker.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WhatsAppTemplatesService)
    private readonly templatesService: WhatsAppTemplatesService,
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<any> {
    if (
      job.name === 'send-interview-invite' ||
      job.name === 'send-interview-reminder'
    ) {
      return this.processInterviewNotification(job);
    }

    return this.processCandidateStatusUpdate(job);
  }

  /**
   * Processes routine stage move & status transition notifications.
   */
  private async processCandidateStatusUpdate(
    job: Job<CandidateStatusUpdateJobData>,
  ): Promise<any> {
    const {
      applicationId,
      candidateName,
      candidatePhone,
      jobTitle,
      companyName,
      stageName,
      rejectionReason,
      customNotes,
    } = job.data;

    this.logger.log(
      `Processing status update notification for candidate ${candidateName} (Application: ${applicationId}) -> Stage: ${stageName}`,
    );

    if (applicationId) {
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
      });
      if (!application) {
        this.logger.warn(
          `Application ${applicationId} no longer exists in database. Skipping status notification.`,
        );
        return { skipped: true, reason: 'APPLICATION_NOT_FOUND' };
      }
    }

    if (!candidatePhone) {
      this.logger.warn(
        `Candidate ${candidateName} has no phone number attached. Skipping WhatsApp dispatch.`,
      );
      return { skipped: true, reason: 'NO_PHONE_NUMBER' };
    }

    // 1. Render stage-specific message template
    const rendered = this.templatesService.renderStageUpdateMessage({
      candidateName,
      jobTitle,
      companyName: companyName || 'Our Company',
      stageName,
      rejectionReason: rejectionReason || undefined,
      customNotes: customNotes || undefined,
    });

    // 2. Dispatch via active WhatsApp Driver
    const sendResult = await this.whatsAppService.send({
      to: candidatePhone,
      templateName: rendered.templateName,
      languageCode: rendered.languageCode,
      parameters: rendered.parameters,
      bodyText: rendered.bodyText,
    });

    // 3. Persist dispatch log to Application metadata for HR visibility
    try {
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (application) {
        const metadata = (application.metadata as Record<string, any>) || {};
        const communications = Array.isArray(metadata.communications)
          ? metadata.communications
          : [];

        communications.push({
          channel: 'WHATSAPP',
          stage: stageName,
          templateName: rendered.templateName,
          recipientPhone: candidatePhone,
          messagePreview: rendered.bodyText,
          messageId: sendResult.messageId || null,
          provider: sendResult.provider,
          success: sendResult.success,
          error: sendResult.error || null,
          sentAt: sendResult.timestamp,
        });

        await this.prisma.application.updateMany({
          where: { id: applicationId },
          data: {
            metadata: {
              ...metadata,
              communications,
              lastContactedAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch (dbErr: any) {
      this.logger.error(
        `Failed to update application metadata with notification log: ${dbErr.message}`,
      );
    }

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
      provider: sendResult.provider,
      templateName: rendered.templateName,
    };
  }

  /**
   * Processes Google Meet interview invitations & 1-day reminders via WhatsApp.
   */
  private async processInterviewNotification(
    job: Job<InterviewNotificationJobData>,
  ): Promise<any> {
    const {
      interviewId,
      applicationId,
      candidateName,
      candidatePhone,
      jobTitle,
      companyName,
      interviewTitle,
      scheduledAt,
      durationMinutes,
      meetingLink,
      type,
    } = job.data;

    this.logger.log(
      `Processing interview ${type} WhatsApp notification for candidate ${candidateName} (Interview: ${interviewId})`,
    );

    // Guard: If interview ID is provided, verify it still exists in DB and is not cancelled
    if (interviewId) {
      const interview = await this.prisma.interview.findUnique({
        where: { id: interviewId },
      });
      if (!interview) {
        this.logger.warn(
          `Interview ${interviewId} no longer exists in database. Skipping ${type} notification.`,
        );
        return { skipped: true, reason: 'INTERVIEW_NOT_FOUND' };
      }
      if (interview.status === 'CANCELED') {
        this.logger.warn(
          `Interview ${interviewId} is CANCELED. Skipping ${type} notification.`,
        );
        return { skipped: true, reason: 'INTERVIEW_CANCELLED' };
      }
    }

    if (!candidatePhone) {
      this.logger.warn(
        `Candidate ${candidateName} has no phone number. Skipping interview ${type} WhatsApp.`,
      );
      return { skipped: true, reason: 'NO_PHONE_NUMBER' };
    }

    const rendered =
      type === 'REMINDER'
        ? this.templatesService.renderInterviewReminderMessage({
            candidateName,
            jobTitle,
            companyName: companyName || 'Our Company',
            interviewTitle: interviewTitle || 'Interview',
            scheduledAt,
            meetingLink,
          })
        : this.templatesService.renderInterviewScheduledMessage({
            candidateName,
            jobTitle,
            companyName: companyName || 'Our Company',
            interviewTitle: interviewTitle || 'Interview',
            scheduledAt,
            meetingLink,
            durationMinutes,
          });

    const sendResult = await this.whatsAppService.send({
      to: candidatePhone,
      templateName: rendered.templateName,
      languageCode: rendered.languageCode,
      parameters: rendered.parameters,
      bodyText: rendered.bodyText,
    });

    // Mark reminder as sent in interview record if this is a reminder
    if (type === 'REMINDER' && interviewId) {
      try {
        await this.prisma.interview.updateMany({
          where: { id: interviewId },
          data: {
            reminderSent: true,
            reminderSentAt: new Date(),
          },
        });
      } catch (err: any) {
        this.logger.error(
          `Failed to update interview reminder status in DB: ${err.message}`,
        );
      }
    }

    // Persist communication entry in Application metadata
    if (applicationId) {
      try {
        const application = await this.prisma.application.findUnique({
          where: { id: applicationId },
        });

        if (application) {
          const metadata = (application.metadata as Record<string, any>) || {};
          const communications = Array.isArray(metadata.communications)
            ? metadata.communications
            : [];

          communications.push({
            channel: 'WHATSAPP',
            type: type === 'REMINDER' ? 'INTERVIEW_REMINDER' : 'INTERVIEW_INVITE',
            stage: 'Interview',
            templateName: rendered.templateName,
            recipientPhone: candidatePhone,
            meetingLink,
            messagePreview: rendered.bodyText,
            messageId: sendResult.messageId || null,
            provider: sendResult.provider,
            success: sendResult.success,
            sentAt: sendResult.timestamp,
          });

          await this.prisma.application.updateMany({
            where: { id: applicationId },
            data: {
              metadata: {
                ...metadata,
                communications,
                lastContactedAt: new Date().toISOString(),
              },
            },
          });
        }
      } catch (dbErr: any) {
        this.logger.error(
          `Failed to update application metadata with interview communication log: ${dbErr.message}`,
        );
      }
    }

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
      provider: sendResult.provider,
      templateName: rendered.templateName,
      meetingLink,
    };
  }
}
