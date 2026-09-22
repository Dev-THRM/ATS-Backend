import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AtsDashboardService } from './ats-dashboard.service.js';

describe('AtsDashboardService', () => {
  let service: AtsDashboardService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      job: {
        count: vi.fn().mockImplementation(({ where }) => {
          if (where.status) return Promise.resolve(5); // active jobs
          return Promise.resolve(8); // total jobs
        }),
      },
      candidate: {
        count: vi.fn().mockResolvedValue(25),
        groupBy: vi.fn().mockResolvedValue([
          { source: 'CAREER_PORTAL', _count: { _all: 2 } },
          { source: 'LINKEDIN', _count: { _all: 1 } },
        ]),
      },
      application: {
        count: vi.fn().mockImplementation(({ where }) => {
          if (where.status === 'ACTIVE') return Promise.resolve(15);
          if (where.status === 'HIRED') return Promise.resolve(3);
          if (where.status === 'REJECTED') return Promise.resolve(7);
          return Promise.resolve(25);
        }),
        groupBy: vi.fn().mockResolvedValue([
          { currentStageId: 'st-1', _count: { _all: 2 } },
        ]),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'app-1',
            appliedAt: new Date(),
            status: 'ACTIVE',
            atsScore: 85,
            candidate: {
              id: 'c-1',
              firstName: 'Maria',
              lastName: 'Silva',
              email: 'maria@example.com',
            },
            job: { id: 'j-1', title: 'Backend Dev', department: 'Engineering' },
            currentStage: { id: 'st-1', name: 'Interview' },
          },
        ]),
      },
      pipelineStage: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'st-1', name: 'Interview' },
        ]),
      },
      interview: {
        count: vi.fn().mockResolvedValue(4),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'int-1',
            title: 'Technical Round 1',
            scheduledAt: new Date(),
            durationMinutes: 45,
            meetingLink: 'https://meet.google.com/abc-defg-hij',
            candidate: { id: 'c-1', firstName: 'Maria', lastName: 'Silva', email: 'maria@example.com' },
            job: { id: 'j-1', title: 'Backend Dev' },
            interviewer: { id: 'u-1', firstName: 'Alex', lastName: 'Lead', email: 'alex@company.com' },
          },
        ]),
      },
    };

    service = new AtsDashboardService(prismaMock);
  });

  it('should aggregate KPIs, funnel, source breakdown, recent applications, and upcoming interviews', async () => {
    const result = await service.getDashboardMetrics('org-1');

    expect(result.kpis.activeJobsCount).toBe(5);
    expect(result.kpis.totalJobsCount).toBe(8);
    expect(result.kpis.totalCandidates).toBe(25);
    expect(result.kpis.activeApplications).toBe(15);
    expect(result.kpis.hiredCount).toBe(3);
    expect(result.kpis.rejectedCount).toBe(7);
    expect(result.kpis.upcomingInterviewsCount).toBe(4);

    expect(result.pipelineFunnel).toBeDefined();
    expect(result.sourcesBreakdown).toBeDefined();
    expect(result.recentApplications).toHaveLength(1);
    expect(result.recentApplications[0].candidateName).toBe('Maria Silva');
    expect(result.upcomingInterviews).toHaveLength(1);
    expect(result.upcomingInterviews[0].meetingLink).toBe('https://meet.google.com/abc-defg-hij');
  });
});
