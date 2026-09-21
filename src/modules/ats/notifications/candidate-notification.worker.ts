import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger, Inject, Optional } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { NOTIFICATION_QUEUE } from '../../shared/queue/queue.module.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { WhatsAppTemplatesService } from './whatsapp-templates.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { EmailService } from './email.service.js';
import { EmailTemplatesService } from './email-templates.service.js';

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
  joiningDate?: string | null;
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
  meetingLink?: string | null;
  locationNotes?: string | null;
  type: 'INVITE' | 'REMINDER';
}

@Processor(NOTIFICATION_QUEUE)
export class CandidateNotificationWorker extends WorkerHost {
  private readonly logger = new Logger(CandidateNotificationWorker.name);
  private readonly emailService: EmailService;
  private readonly emailTemplatesService: EmailTemplatesService;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WhatsAppTemplatesService)
    private readonly templatesService: WhatsAppTemplatesService,
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
    @Optional()
    @Inject(EmailService)
    emailService?: EmailService,
    @Optional()
    @Inject(EmailTemplatesService)
    emailTemplatesService?: EmailTemplatesService,
    @Optional()
    @InjectQueue(NOTIFICATION_QUEUE)
    private readonly notificationQueue?: Queue,
  ) {
    super();
    this.emailService = emailService || new EmailService();
    this.emailTemplatesService =
      emailTemplatesService || new EmailTemplatesService();
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
   * Dispatches candidate status notifications with automatic inline execution fallback.
   * Tries BullMQ first (if queue is healthy). If BullMQ fails or Redis is unavailable/rate-limited,
   * runs immediately via inline execution (Google SMTP + Prisma audit logging).
   */
  async dispatchCandidateStatusUpdate(
    data: CandidateStatusUpdateJobData,
  ): Promise<any> {
    // 1. Try enqueuing to BullMQ if queue is injected
    if (this.notificationQueue) {
      try {
        const job = await this.notificationQueue.add('send-candidate-status-update', data);
        this.logger.log(`Candidate status update enqueued via BullMQ (Job ${job.id})`);
        return { enqueued: true, jobId: job.id };
      } catch (queueErr: any) {
        this.logger.warn(
          `BullMQ queue unavailable for candidate status update (${queueErr.message}). Executing immediate inline dispatch via Google SMTP.`,
        );
      }
    }

    // 2. Direct inline execution fallback
    return this.processCandidateStatusUpdate(data);
  }

  /**
   * Dispatches interview notifications with automatic inline fallback.
   */
  async dispatchInterviewNotification(
    data: InterviewNotificationJobData,
  ): Promise<any> {
    if (this.notificationQueue) {
      try {
        const job = await this.notificationQueue.add(
          data.type === 'REMINDER' ? 'send-interview-reminder' : 'send-interview-invite',
          data,
        );
        this.logger.log(`Interview notification enqueued via BullMQ (Job ${job.id})`);
        return { enqueued: true, jobId: job.id };
      } catch (queueErr: any) {
        this.logger.warn(
          `BullMQ queue unavailable for interview notification (${queueErr.message}). Executing immediate inline dispatch.`,
        );
      }
    }

    // Direct inline fallback
    return this.processInterviewNotification(data);
  }

  /**
   * Processes routine stage move & status transition notifications.
   */
  async processCandidateStatusUpdate(
    jobOrData: Job<CandidateStatusUpdateJobData> | CandidateStatusUpdateJobData,
  ): Promise<any> {
    const data: CandidateStatusUpdateJobData =
      'data' in jobOrData && jobOrData.data
        ? (jobOrData.data as CandidateStatusUpdateJobData)
        : (jobOrData as CandidateStatusUpdateJobData);

    const {
      applicationId,
      candidateName,
      candidatePhone,
      candidateEmail,
      jobTitle,
      companyName,
      stageName,
      rejectionReason,
      customNotes,
      joiningDate,
    } = data;

    const resolvedCompany = companyName || 'THRM Digital Marketing Agency';

    this.logger.log(
      `Processing status update notification for candidate ${candidateName} (${candidateEmail || candidatePhone || 'no-contact'}) -> Stage: ${stageName}`,
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

    if (!candidatePhone && !candidateEmail) {
      this.logger.warn(
        `Candidate ${candidateName} has neither phone number nor email attached. Skipping dispatch.`,
      );
      return { skipped: true, reason: 'NO_PHONE_NUMBER' };
    }

    const newLogs: any[] = [];
    let emailResult: any = null;
    let whatsAppResult: any = null;

    // -------------------------------------------------------------------------
    // 1. WhatsApp Dispatch (if candidate phone is present)
    // -------------------------------------------------------------------------
    if (candidatePhone) {
      try {
        const rendered = this.templatesService.renderStageUpdateMessage({
          candidateName,
          jobTitle,
          companyName: resolvedCompany,
          stageName,
          rejectionReason: rejectionReason || undefined,
          customNotes: customNotes || undefined,
          joiningDate: joiningDate || undefined,
        });

        whatsAppResult = await this.whatsAppService.send({
          to: candidatePhone,
          templateName: rendered.templateName,
          languageCode: rendered.languageCode,
          parameters: rendered.parameters,
          bodyText: rendered.bodyText,
        });

        newLogs.push({
          channel: 'WHATSAPP',
          stage: stageName,
          templateName: rendered.templateName,
          recipientPhone: candidatePhone,
          messagePreview: rendered.bodyText,
          messageId: whatsAppResult.messageId || null,
          provider: whatsAppResult.provider,
          success: whatsAppResult.success,
          error: whatsAppResult.error || null,
          sentAt: whatsAppResult.timestamp,
        });
      } catch (waErr: any) {
        this.logger.error(`Error sending WhatsApp to ${candidatePhone}: ${waErr.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // 2. Email Dispatch (Application Received, Offer Cleared, or Rejection)
    // -------------------------------------------------------------------------
    if (candidateEmail && candidateEmail.includes('@')) {
      try {
        const renderedEmail = this.emailTemplatesService.renderStageEmail({
          candidateName,
          jobTitle,
          companyName: resolvedCompany,
          stageName,
          rejectionReason,
          customNotes,
          joiningDate,
        });

        emailResult = await this.emailService.sendMail({
          to: candidateEmail,
          subject: renderedEmail.subject,
          html: renderedEmail.html,
          text: renderedEmail.text,
        });

        newLogs.push({
          channel: 'EMAIL',
          stage: stageName,
          subject: renderedEmail.subject,
          messagePreview: renderedEmail.text,
          recipientEmail: candidateEmail,
          messageId: emailResult.messageId || null,
          provider: emailResult.simulated ? 'GMAIL_SIMULATED' : 'GMAIL_SMTP',
          success: emailResult.success,
          error: emailResult.error || null,
          sentAt: emailResult.timestamp,
        });
      } catch (emailErr: any) {
        this.logger.error(`Error sending email to ${candidateEmail}: ${emailErr.message}`);
        newLogs.push({
          channel: 'EMAIL',
          stage: stageName,
          recipientEmail: candidateEmail,
          success: false,
          error: emailErr.message,
          sentAt: new Date().toISOString(),
        });
      }
    } else {
      this.logger.debug(`Candidate ${candidateName} has no valid email address. Skipping email dispatch.`);
    }

    // -------------------------------------------------------------------------
    // 3. Persist audit logs to Application metadata
    // -------------------------------------------------------------------------
    if (applicationId && newLogs.length > 0) {
      try {
        const application = await this.prisma.application.findUnique({
          where: { id: applicationId },
        });

        if (application) {
          const metadata = (application.metadata as Record<string, any>) || {};
          const communications = Array.isArray(metadata.communications)
            ? metadata.communications
            : [];

          communications.push(...newLogs);

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
    }

    const templateName =
      whatsAppResult?.templateName ||
      (rejectionReason
        ? 'ats_stage_rejected'
        : stageName.toLowerCase().includes('offer')
          ? 'ats_stage_offer'
          : 'ats_stage_interview');

    return {
      success: Boolean(emailResult?.success || whatsAppResult?.success),
      templateName,
      messageId: whatsAppResult?.messageId || emailResult?.messageId,
      provider: whatsAppResult?.provider || emailResult?.provider,
      emailResult,
      whatsAppResult,
    };
  }

  /**
   * Processes Google Meet interview invitations & 1-day reminders via WhatsApp.
   */
  async processInterviewNotification(
    jobOrData: Job<InterviewNotificationJobData> | InterviewNotificationJobData,
  ): Promise<any> {
    const data: InterviewNotificationJobData =
      'data' in jobOrData && jobOrData.data
        ? (jobOrData.data as InterviewNotificationJobData)
        : (jobOrData as InterviewNotificationJobData);

    const {
      interviewId,
      applicationId,
      candidateName,
      candidatePhone,
      candidateEmail,
      jobTitle,
      companyName,
      interviewTitle,
      scheduledAt,
      durationMinutes,
      meetingLink,
      locationNotes,
      type,
    } = data;

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

    if (!candidatePhone && !candidateEmail) {
      this.logger.warn(
        `Candidate ${candidateName} has neither phone number nor email. Skipping interview ${type} notification.`,
      );
      return { skipped: true, reason: 'NO_CONTACT_INFO' };
    }

    const newLogs: any[] = [];
    let emailResult: any = null;
    let whatsAppResult: any = null;
    let renderedWhatsApp: any = null;

    // 1. Dispatch Email Notification (for new interview invitations or reminders)
    if (candidateEmail && candidateEmail.includes('@')) {
      try {
        const renderedEmail = this.emailTemplatesService.renderInterviewInvitationEmail({
          candidateName,
          jobTitle,
          companyName: companyName || 'Our Company',
          interviewTitle: interviewTitle || 'Interview',
          scheduledAt,
          durationMinutes: durationMinutes || 45,
          meetingLink,
          locationNotes,
        });

        emailResult = await this.emailService.sendMail({
          to: candidateEmail,
          subject: renderedEmail.subject,
          html: renderedEmail.html,
          text: renderedEmail.text,
        });

        newLogs.push({
          channel: 'EMAIL',
          type: type === 'REMINDER' ? 'INTERVIEW_REMINDER' : 'INTERVIEW_INVITE',
          stage: 'Interview',
          subject: renderedEmail.subject,
          recipientEmail: candidateEmail,
          meetingLink,
          messagePreview: renderedEmail.text,
          messageId: emailResult.messageId || null,
          provider: emailResult.simulated ? 'GMAIL_SIMULATED' : 'GMAIL_SMTP',
          success: emailResult.success,
          error: emailResult.error || null,
          sentAt: emailResult.timestamp,
        });
      } catch (emailErr: any) {
        this.logger.error(`Error sending interview email to ${candidateEmail}: ${emailErr.message}`);
        newLogs.push({
          channel: 'EMAIL',
          type: type === 'REMINDER' ? 'INTERVIEW_REMINDER' : 'INTERVIEW_INVITE',
          stage: 'Interview',
          recipientEmail: candidateEmail,
          success: false,
          error: emailErr.message,
          sentAt: new Date().toISOString(),
        });
      }
    }

    // 2. Dispatch WhatsApp Notification (if candidatePhone is provided)
    if (candidatePhone) {
      try {
        renderedWhatsApp =
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

        whatsAppResult = await this.whatsAppService.send({
          to: candidatePhone,
          templateName: renderedWhatsApp.templateName,
          languageCode: renderedWhatsApp.languageCode,
          parameters: renderedWhatsApp.parameters,
          bodyText: renderedWhatsApp.bodyText,
        });

        newLogs.push({
          channel: 'WHATSAPP',
          type: type === 'REMINDER' ? 'INTERVIEW_REMINDER' : 'INTERVIEW_INVITE',
          stage: 'Interview',
          templateName: renderedWhatsApp.templateName,
          recipientPhone: candidatePhone,
          meetingLink,
          messagePreview: renderedWhatsApp.bodyText,
          messageId: whatsAppResult.messageId || null,
          provider: whatsAppResult.provider,
          success: whatsAppResult.success,
          error: whatsAppResult.error || null,
          sentAt: whatsAppResult.timestamp,
        });
      } catch (waErr: any) {
        this.logger.error(`Error sending interview WhatsApp to ${candidatePhone}: ${waErr.message}`);
      }
    }

    // 3. Mark reminder as sent in interview record if this is a reminder
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

    // 4. Persist communication entries in Application metadata
    if (applicationId && newLogs.length > 0) {
      try {
        const application = await this.prisma.application.findUnique({
          where: { id: applicationId },
        });

        if (application) {
          const metadata = (application.metadata as Record<string, any>) || {};
          const communications = Array.isArray(metadata.communications)
            ? metadata.communications
            : [];

          communications.push(...newLogs);

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
      success: Boolean(emailResult?.success || whatsAppResult?.success),
      emailResult,
      whatsAppResult,
      templateName: renderedWhatsApp?.templateName || 'ats_interview_scheduled',
      meetingLink,
    };
  }
}
