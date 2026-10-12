import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { EmailService } from '../notifications/email.service.js';
import { EmailTemplatesService } from '../notifications/email-templates.service.js';
import { ContactInquiryDto } from './dto/contact-inquiry.dto.js';

@ApiTags('Public Inquiries')
@Controller('ats/public')
export class PublicInquiryController {
  private readonly logger = new Logger(PublicInquiryController.name);

  constructor(
    @Inject(EmailService)
    private readonly emailService: EmailService,
    @Inject(EmailTemplatesService)
    private readonly emailTemplatesService: EmailTemplatesService,
  ) {}

  @Post('contact-inquiry')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  @ApiOperation({
    summary: 'Submit custom walkthrough & quote inquiry',
    description: 'Dispatches ATS template notification email to dev@thrmdigitalmarketing.in and acknowledgment to inquirer',
  })
  @ApiResponse({ status: 200, description: 'Inquiry successfully processed and notification dispatched.' })
  async handleContactInquiry(@Body() dto: ContactInquiryDto) {
    const adminRecipient = 'dev@thrmdigitalmarketing.in';

    this.logger.log(
      `Received enterprise walkthrough & quote inquiry from "${dto.name}" <${dto.email}> (${dto.company || 'No Company'})`,
    );

    // 1. Dispatch Enterprise Admin Notification to dev@thrmdigitalmarketing.in
    const adminEmail = this.emailTemplatesService.renderContactInquiryAdminEmail(dto);
    const adminResult = await this.emailService.sendMail({
      to: adminRecipient,
      subject: adminEmail.subject,
      html: adminEmail.html,
      text: adminEmail.text,
    });

    // 2. Dispatch User Confirmation Acknowledgment
    let ackResult = null;
    if (dto.email && dto.email.includes('@')) {
      try {
        const userEmail = this.emailTemplatesService.renderContactInquiryAcknowledgmentEmail(dto);
        ackResult = await this.emailService.sendMail({
          to: dto.email,
          subject: userEmail.subject,
          html: userEmail.html,
          text: userEmail.text,
        });
      } catch (err: any) {
        this.logger.warn(`Failed to dispatch user acknowledgment email: ${err.message}`);
      }
    }

    return {
      success: true,
      message: 'Inquiry received. Our talent solutions architect will contact you within 2 hours.',
      recipient: adminRecipient,
      adminDelivered: adminResult.success,
      acknowledgmentDelivered: ackResult?.success ?? false,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('contact')
  @HttpCode(HttpStatus.OK)
  async handleContactAlias(@Body() dto: ContactInquiryDto) {
    return this.handleContactInquiry(dto);
  }
}
