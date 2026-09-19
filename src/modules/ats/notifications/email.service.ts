import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendEmailResult {
  success: boolean;
  simulated?: boolean;
  messageId?: string | null;
  error?: string | null;
  timestamp: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 465;
    const secure = process.env.SMTP_SECURE !== 'false' && port === 465;
    const user = process.env.SMTP_USER || 'dev@thrmdigitalmarketing.in';
    const pass = (process.env.SMTP_PASS || '').trim();

    if (pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
      });
      this.logger.log(
        `Gmail SMTP Transporter initialized for ${user} (Host: ${host}:${port}, Secure: ${secure})`,
      );
    } else {
      this.logger.warn(
        `SMTP_PASS is not configured in .env. Emails will be logged to console in simulation mode until a Google App Password is provided.`,
      );
    }
  }

  /**
   * Indicates whether real SMTP credentials are fully provisioned.
   */
  isConfigured(): boolean {
    return Boolean(this.transporter && (process.env.SMTP_PASS || '').trim());
  }

  /**
   * Transmits an HTML email to the candidate or simulates delivery if credentials are pending.
   */
  async sendMail(options: SendEmailOptions): Promise<SendEmailResult> {
    const timestamp = new Date().toISOString();
    const from =
      options.from ||
      process.env.SMTP_FROM ||
      `THRM Digital Marketing <${process.env.SMTP_USER || 'dev@thrmdigitalmarketing.in'}>`;

    if (!options.to || !options.to.includes('@')) {
      this.logger.warn(`Invalid or missing recipient email address: "${options.to}"`);
      return {
        success: false,
        simulated: false,
        error: 'Invalid recipient email address',
        timestamp,
      };
    }

    // If transporter is not configured, simulate delivery safely
    if (!this.transporter || !this.isConfigured()) {
      this.logger.log(
        `[SIMULATED EMAIL DISPATCH] To: ${options.to} | Subject: "${options.subject}" | From: ${from}`,
      );
      return {
        success: true,
        simulated: true,
        messageId: `simulated-mail-${Date.now()}`,
        timestamp,
      };
    }

    try {
      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text || options.subject,
        html: options.html,
      });

      this.logger.log(
        `Email successfully delivered to ${options.to} via Gmail SMTP (Message ID: ${info.messageId})`,
      );

      return {
        success: true,
        simulated: false,
        messageId: info.messageId,
        timestamp,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${options.to} via Gmail SMTP: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        simulated: false,
        error: error.message,
        timestamp,
      };
    }
  }
}
