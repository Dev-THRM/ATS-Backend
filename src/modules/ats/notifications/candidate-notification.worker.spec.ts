import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CandidateNotificationWorker } from './candidate-notification.worker.js';
import { WhatsAppTemplatesService } from './whatsapp-templates.service.js';
import { WhatsAppService } from './whatsapp.service.js';
import { ConfigService } from '@nestjs/config';

describe('CandidateNotificationWorker', () => {
  let worker: CandidateNotificationWorker;
  let prismaMock: any;
  let templatesService: WhatsAppTemplatesService;
  let whatsAppService: WhatsAppService;

  beforeEach(() => {
    prismaMock = {
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'app-1',
          metadata: { communications: [] },
        }),
        update: vi.fn().mockResolvedValue({
          id: 'app-1',
        }),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
      },
      interview: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'int-1',
          status: 'SCHEDULED',
        }),
        updateMany: vi.fn().mockResolvedValue({
          count: 1,
        }),
      },
    };

    templatesService = new WhatsAppTemplatesService();
    whatsAppService = new WhatsAppService(new ConfigService());
    worker = new CandidateNotificationWorker(
      prismaMock,
      templatesService,
      whatsAppService,
    );
  });

  it('should process status update job and record communication history in database', async () => {
    const jobMock: any = {
      id: 'job-1',
      data: {
        applicationId: 'app-1',
        candidateId: 'cand-1',
        candidateName: 'Maria Santos',
        candidatePhone: '+5511988887777',
        candidateEmail: 'maria@example.com',
        jobId: 'job-10',
        jobTitle: 'Fullstack Developer',
        companyName: 'Tech Hub',
        stageName: 'Interview',
      },
    };

    const result = await worker.process(jobMock);

    expect(result.success).toBe(true);
    expect(result.templateName).toBe('ats_stage_interview');
    expect(prismaMock.application.findUnique).toHaveBeenCalledWith({
      where: { id: 'app-1' },
    });
    expect(prismaMock.application.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            communications: expect.arrayContaining([
              expect.objectContaining({
                channel: 'WHATSAPP',
                stage: 'Interview',
                recipientPhone: '+5511988887777',
                success: true,
              }),
            ]),
          }),
        }),
      }),
    );
  });

  it('should skip processing gracefully if candidate has no phone number', async () => {
    const jobMock: any = {
      id: 'job-2',
      data: {
        applicationId: 'app-2',
        candidateId: 'cand-2',
        candidateName: 'No Phone Candidate',
        candidatePhone: null,
        jobId: 'job-10',
        jobTitle: 'Dev',
        companyName: 'Tech Hub',
        stageName: 'Applied',
      },
    };

    const result = await worker.process(jobMock);

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('NO_PHONE_NUMBER');
    expect(prismaMock.application.update).not.toHaveBeenCalled();
  });
});
