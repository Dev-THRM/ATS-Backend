import { Injectable } from '@nestjs/common';

export interface StageUpdateTemplateParams {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  stageName: string;
  rejectionReason?: string;
  customNotes?: string;
  joiningDate?: string;
  language?: string;
}

export interface InterviewMessageParams {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  interviewTitle: string;
  scheduledAt: Date | string;
  meetingLink?: string | null;
  durationMinutes?: number;
  language?: string;
}

export interface RenderedTemplate {
  templateName: string;
  languageCode: string;
  bodyText: string;
  parameters: Record<string, string>;
}

@Injectable()
export class WhatsAppTemplatesService {
  /**
   * Evaluates the pipeline stage and resolves the corresponding WhatsApp message template.
   */
  renderStageUpdateMessage(params: StageUpdateTemplateParams): RenderedTemplate {
    const {
      candidateName,
      jobTitle,
      companyName,
      stageName,
      rejectionReason,
      customNotes,
      language = 'en',
    } = params;

    const normalizedStage = stageName.trim().toLowerCase();
    let templateName = 'ats_stage_generic_update';
    let bodyText = '';

    const parameters: Record<string, string> = {
      '1': candidateName,
      '2': jobTitle,
      '3': companyName,
      '4': stageName,
    };

    if (normalizedStage.includes('reject')) {
      templateName = 'ats_stage_rejected';
      const reasonSuffix = rejectionReason ? ` Feedback: ${rejectionReason}` : '';
      bodyText = `Hi ${candidateName}, thank you for your interest in the ${jobTitle} role at ${companyName}. After careful review, we have decided to move forward with other candidates at this time.${reasonSuffix} We wish you all the best in your job search.`;
      if (rejectionReason) {
        parameters['5'] = rejectionReason;
      }
    } else if (normalizedStage.includes('offer')) {
      templateName = 'ats_stage_offer';
      const joiningSuffix = params.joiningDate ? ` Your anticipated date of joining is ${params.joiningDate}.` : '';
      bodyText = `Hi ${candidateName}, congratulations! 🎉 We are thrilled to extend an offer for the ${jobTitle} position at ${companyName}.${joiningSuffix} Our team will share the formal offer details and next steps shortly.`;
    } else if (
      normalizedStage.includes('interview') ||
      normalizedStage.includes('tech round') ||
      normalizedStage.includes('screening')
    ) {
      templateName = 'ats_stage_interview';
      const noteSuffix = customNotes ? ` Note: ${customNotes}` : '';
      bodyText = `Hi ${candidateName}, great news! You have been moved to the ${stageName} stage for the ${jobTitle} position at ${companyName}.${noteSuffix} Our recruiting team will follow up with scheduling details.`;
      if (customNotes) {
        parameters['5'] = customNotes;
      }
    } else if (
      normalizedStage.includes('applied') ||
      normalizedStage.includes('application')
    ) {
      templateName = 'ats_stage_applied';
      bodyText = `Hi ${candidateName}, thanks for applying for the ${jobTitle} role at ${companyName}! We have received your application and our recruitment team is currently reviewing your profile.`;
    } else {
      templateName = 'ats_stage_generic_update';
      bodyText = `Hi ${candidateName}, your application for the ${jobTitle} role at ${companyName} has been updated to stage: ${stageName}. We will keep you updated on the next steps!`;
    }

    return {
      templateName,
      languageCode: language,
      bodyText,
      parameters,
    };
  }

  /**
   * Renders automated WhatsApp confirmation when an interview is scheduled.
   */
  renderInterviewScheduledMessage(params: InterviewMessageParams): RenderedTemplate {
    const {
      candidateName,
      jobTitle,
      companyName,
      interviewTitle,
      scheduledAt,
      meetingLink,
      durationMinutes = 45,
      language = 'en',
    } = params;

    const dateStr =
      scheduledAt instanceof Date
        ? scheduledAt.toUTCString()
        : new Date(scheduledAt).toUTCString();

    const templateName = 'ats_interview_scheduled';
    const bodyText = meetingLink
      ? `Hi ${candidateName}, your ${interviewTitle} for the ${jobTitle} position at ${companyName} has been scheduled!\n📅 Date & Time (UTC): ${dateStr}\n⏱ Duration: ${durationMinutes} mins\n🔗 Google Meet Link: ${meetingLink}\n\nPlease be online 5 minutes before the start time. Good luck!`
      : `Hi ${candidateName}, your ${interviewTitle} for the ${jobTitle} position at ${companyName} has been scheduled!\n📅 Date & Time (UTC): ${dateStr}\n⏱ Duration: ${durationMinutes} mins\n📍 Venue / Mode: Offline / In-Person\n\nPlease arrive 10 minutes before the scheduled time. Good luck!`;

    const parameters: Record<string, string> = {
      '1': candidateName,
      '2': interviewTitle,
      '3': jobTitle,
      '4': companyName,
      '5': dateStr,
      '6': meetingLink || 'In-Person (Office)',
    };

    return {
      templateName,
      languageCode: language,
      bodyText,
      parameters,
    };
  }

  /**
   * Renders automated WhatsApp 1-day reminder prior to the interview date.
   */
  renderInterviewReminderMessage(params: InterviewMessageParams): RenderedTemplate {
    const {
      candidateName,
      jobTitle,
      companyName,
      interviewTitle,
      scheduledAt,
      meetingLink,
      language = 'en',
    } = params;

    const dateStr =
      scheduledAt instanceof Date
        ? scheduledAt.toUTCString()
        : new Date(scheduledAt).toUTCString();

    const templateName = 'ats_interview_reminder';
    const bodyText = meetingLink
      ? `Hi ${candidateName}, this is a friendly reminder that your ${interviewTitle} for ${jobTitle} at ${companyName} is tomorrow at ${dateStr}!\n🔗 Google Meet Link: ${meetingLink}\n\nWe look forward to speaking with you.`
      : `Hi ${candidateName}, this is a friendly reminder that your ${interviewTitle} for ${jobTitle} at ${companyName} is tomorrow at ${dateStr}!\n📍 Venue / Mode: Offline / In-Person\n\nWe look forward to meeting with you at our office.`;

    const parameters: Record<string, string> = {
      '1': candidateName,
      '2': interviewTitle,
      '3': jobTitle,
      '4': companyName,
      '5': dateStr,
      '6': meetingLink || 'In-Person (Office)',
    };

    return {
      templateName,
      languageCode: language,
      bodyText,
      parameters,
    };
  }

  /**
   * Helper to replace {{placeholder}} tags inside dynamic template strings.
   */
  formatCustomTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] !== undefined ? variables[key] : `{{${key}}}`;
    });
  }
}
