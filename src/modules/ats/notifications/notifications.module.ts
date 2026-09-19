import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module.js';
import { WhatsAppTemplatesService } from './whatsapp-templates.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { EmailService } from './email.service.js';
import { EmailTemplatesService } from './email-templates.service.js';
import { CandidateNotificationWorker } from './candidate-notification.worker.js';

@Module({
  imports: [SharedModule],
  providers: [
    WhatsAppTemplatesService,
    WhatsAppService,
    EmailService,
    EmailTemplatesService,
    CandidateNotificationWorker,
  ],
  exports: [
    WhatsAppTemplatesService,
    WhatsAppService,
    EmailService,
    EmailTemplatesService,
    CandidateNotificationWorker,
  ],
})
export class NotificationsModule {}
