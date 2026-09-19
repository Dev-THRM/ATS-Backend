import { describe, it, expect, beforeEach } from 'vitest';
import { EmailTemplatesService } from './email-templates.service.js';
import { EmailService } from './email.service.js';

describe('EmailTemplatesService & EmailService', () => {
  let templatesService: EmailTemplatesService;
  let emailService: EmailService;

  beforeEach(() => {
    templatesService = new EmailTemplatesService();
    emailService = new EmailService();
  });

  describe('renderApplicationReceivedEmail', () => {
    it('should generate acknowledgment email with job title and company name', () => {
      const email = templatesService.renderApplicationReceivedEmail({
        candidateName: 'Sakshi Baheti',
        jobTitle: 'SEO Executive',
        companyName: 'THRM Digital Marketing Agency',
      });

      expect(email.subject).toBe('Application Received: SEO Executive at THRM Digital Marketing Agency');
      expect(email.text).toContain('Sakshi Baheti');
      expect(email.text).toContain('SEO Executive');
      expect(email.text).toContain('THRM Digital Marketing Agency');
      expect(email.html).toContain('Sakshi Baheti');
      expect(email.html).toContain('Application Acknowledgment');
    });
  });

  describe('renderOfferEmail (Cleared HR Round)', () => {
    it('should generate congratulations offer email when candidate clears HR round', () => {
      const email = templatesService.renderOfferEmail({
        candidateName: 'Akash Sahni',
        jobTitle: 'Senior Fullstack Engineer',
        companyName: 'THRM Digital Marketing Agency',
        customNotes: 'Reporting to Tech Lead on 1st of next month.',
      });

      expect(email.subject).toContain('Congratulations! Job Offer');
      expect(email.text).toContain('Akash Sahni');
      expect(email.text).toContain('successfully cleared the HR and interview rounds');
      expect(email.text).toContain('Reporting to Tech Lead on 1st of next month.');
      expect(email.html).toContain('Congratulations, Akash Sahni!');
      expect(email.html).toContain('Offer of Employment');
    });
  });

  describe('renderRejectionEmail (Failed HR Round / Rejected)', () => {
    it('should generate courteous "so sorry" rejection email with feedback', () => {
      const email = templatesService.renderRejectionEmail({
        candidateName: 'Jane Doe',
        jobTitle: 'Content Strategist',
        companyName: 'THRM Digital Marketing Agency',
        rejectionReason: 'Looking for 3+ years of agency experience.',
      });

      expect(email.subject).toContain('Update regarding your application for Content Strategist');
      expect(email.text).toContain('Jane Doe');
      expect(email.text.toLowerCase()).toContain('we are so sorry');
      expect(email.text).toContain('Looking for 3+ years of agency experience.');
      expect(email.html).toContain('Jane Doe');
      expect(email.html.toLowerCase()).toContain('we are so sorry to inform you');
      expect(email.html).toContain('Looking for 3+ years of agency experience.');
    });
  });

  describe('renderStageEmail auto-routing', () => {
    it('should route "Offer" stage to renderOfferEmail', () => {
      const email = templatesService.renderStageEmail({
        candidateName: 'Alice',
        jobTitle: 'HR Specialist',
        companyName: 'THRM Digital Marketing Agency',
        stageName: 'Offer',
      });

      expect(email.subject).toContain('Congratulations! Job Offer');
    });

    it('should route "HR Offer" stage to renderOfferEmail', () => {
      const email = templatesService.renderStageEmail({
        candidateName: 'Bob',
        jobTitle: 'Designer',
        companyName: 'THRM Digital Marketing Agency',
        stageName: 'HR Offer',
      });

      expect(email.subject).toContain('Congratulations! Job Offer');
    });

    it('should route "Rejected" stage or rejection reason to renderRejectionEmail', () => {
      const email = templatesService.renderStageEmail({
        candidateName: 'Charlie',
        jobTitle: 'Copywriter',
        companyName: 'THRM Digital Marketing Agency',
        stageName: 'Rejected',
        rejectionReason: 'Culture fit evaluation',
      });

      expect(email.text.toLowerCase()).toContain('we are so sorry');
    });

    it('should route "Applied" stage to renderApplicationReceivedEmail', () => {
      const email = templatesService.renderStageEmail({
        candidateName: 'Diana',
        jobTitle: 'Brand Manager',
        companyName: 'THRM Digital Marketing Agency',
        stageName: 'Applied',
      });

      expect(email.subject).toBe('Application Received: Brand Manager at THRM Digital Marketing Agency');
    });
  });

  describe('EmailService', () => {
    it('should run in simulated mode when SMTP_PASS is unset and return success', async () => {
      const result = await emailService.sendMail({
        to: 'candidate@example.com',
        subject: 'Test Notification',
        html: '<p>Hello Candidate</p>',
      });

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.messageId).toContain('simulated-mail');
    });

    it('should reject invalid recipient email addresses', async () => {
      const result = await emailService.sendMail({
        to: 'invalid-email',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid recipient email address');
    });
  });
});
