import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewsService } from './interviews.service.js';
import { CalendarService } from './calendar.service.js';
import { InterviewStatus, InterviewType } from '@prisma/client';

describe('InterviewsService', () => {
  let service: InterviewsService;
  let prismaMock: any;
  let calendarService: CalendarService;
  let queueMock: any;

  beforeEach(() => {
    prismaMock = {
      application: {
        findFirst: vi.fn(),
      },
      interview: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };

    queueMock = {
      add: vi.fn().mockResolvedValue({ id: 'job-mock' }),
    };

    calendarService = new CalendarService();
    service = new InterviewsService(prismaMock, calendarService, queueMock);
  });

  it('should schedule offline interview by default when no meeting link is provided', async () => {
    const scheduledDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // 2 days in the future

    prismaMock.application.findFirst.mockResolvedValue({
      id: 'app-1',
      organizationId: 'org-1',
      candidateId: 'cand-1',
      jobId: 'job-1',
      candidate: {
        id: 'cand-1',
        firstName: 'Elena',
        lastName: 'Rostova',
        phone: '+5511999887766',
        email: 'elena@example.com',
      },
      job: {
        id: 'job-1',
        title: 'Lead Architect',
        organization: { name: 'Acme Corp' },
      },
      currentStage: { id: 'st-interview', name: 'Interview' },
    });

    prismaMock.interview.create.mockImplementation(({ data }: any) => ({
      id: 'interview-1',
      ...data,
      candidate: { firstName: 'Elena', lastName: 'Rostova' },
      job: { title: 'Lead Architect' },
    }));

    const result = await service.create(
      'org-1',
      {
        applicationId: 'app-1',
        title: 'Technical Round 1',
        type: InterviewType.TECHNICAL,
        scheduledAt: scheduledDate.toISOString(),
        durationMinutes: 45,
      },
      'user-hr-1',
    );

    expect(result.id).toBe('interview-1');
    expect(result.meetingLink).toBeNull();
    expect(result.googleCalendarHtmlLink).toBeDefined();

    // Verify WhatsApp invite was enqueued with offline details
    expect(queueMock.add).toHaveBeenCalledWith(
      'send-interview-invite',
      expect.objectContaining({
        interviewId: 'interview-1',
        candidatePhone: '+5511999887766',
        interviewTitle: 'Technical Round 1',
        type: 'INVITE',
      }),
    );

    // Verify 1-day delayed reminder was enqueued with delay
    expect(queueMock.add).toHaveBeenCalledWith(
      'send-interview-reminder',
      expect.objectContaining({
        interviewId: 'interview-1',
        type: 'REMINDER',
      }),
      expect.objectContaining({
        delay: expect.any(Number),
      }),
    );
  });

  it('should schedule online interview when Google Meet meetingLink is provided', async () => {
    const scheduledDate = new Date(Date.now() + 48 * 60 * 60 * 1000);

    prismaMock.application.findFirst.mockResolvedValue({
      id: 'app-1',
      organizationId: 'org-1',
      candidateId: 'cand-1',
      jobId: 'job-1',
      candidate: {
        id: 'cand-1',
        firstName: 'Elena',
        lastName: 'Rostova',
        phone: '+5511999887766',
        email: 'elena@example.com',
      },
      job: {
        id: 'job-1',
        title: 'Lead Architect',
        organization: { name: 'Acme Corp' },
      },
      currentStage: { id: 'st-interview', name: 'Interview' },
    });

    prismaMock.interview.create.mockImplementation(({ data }: any) => ({
      id: 'interview-2',
      ...data,
      candidate: { firstName: 'Elena', lastName: 'Rostova' },
      job: { title: 'Lead Architect' },
    }));

    const result = await service.create(
      'org-1',
      {
        applicationId: 'app-1',
        title: 'Technical Round 1',
        type: InterviewType.TECHNICAL,
        scheduledAt: scheduledDate.toISOString(),
        durationMinutes: 45,
        meetingLink: 'https://meet.google.com/xyz-abcd-uvw',
      },
      'user-hr-1',
    );

    expect(result.id).toBe('interview-2');
    expect(result.meetingLink).toBe('https://meet.google.com/xyz-abcd-uvw');
  });

  it('should submit feedback and mark interview as COMPLETED', async () => {
    prismaMock.interview.findFirst.mockResolvedValue({
      id: 'interview-1',
      organizationId: 'org-1',
    });

    prismaMock.interview.update.mockResolvedValue({
      id: 'interview-1',
      status: InterviewStatus.COMPLETED,
      feedbackRating: 5,
      feedbackNotes: 'Strong knowledge of NestJS and system scalability.',
    });

    const result = await service.submitFeedback('org-1', 'interview-1', {
      rating: 5,
      notes: 'Strong knowledge of NestJS and system scalability.',
    });

    expect(result.status).toBe(InterviewStatus.COMPLETED);
    expect(result.feedbackRating).toBe(5);
  });
});
