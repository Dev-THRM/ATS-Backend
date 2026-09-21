import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResumeProcessorWorker } from './resume-processor.worker.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { ResumeParserService } from './resume-parser.service.js';
import { AiDetectorService } from './ai-detector.service.js';
import { StageTransitionService } from '../../shared/pipelines/stage-transition.service.js';
import { ApplicationStatus } from '@prisma/client';

describe('ResumeProcessorWorker', () => {
  let worker: ResumeProcessorWorker;
  let storageService: StorageService;
  let prisma: PrismaService;
  let resumeParser: ResumeParserService;
  let aiDetector: AiDetectorService;
  let stageTransitionService: StageTransitionService;

  beforeEach(() => {
    storageService = {
      getFileBuffer: vi.fn().mockResolvedValue(Buffer.from('Resume text content')),
    } as unknown as StorageService;

    prisma = {
      application: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      candidate: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaService;

    resumeParser = {
      extractTextFromBuffer: vi.fn().mockResolvedValue('Extracted resume text'),
      parseResumeText: vi.fn().mockReturnValue({
        skills: ['TypeScript', 'NestJS'],
        candidateInfo: { phone: '1234567890' },
        experienceYears: 4,
        education: [],
      }),
      calculateAtsScore: vi.fn().mockReturnValue({
        score: 88,
        matchedSkills: ['TypeScript'],
        missingSkills: [],
        breakdown: {},
      }),
    } as unknown as ResumeParserService;

    aiDetector = {
      detectAiContent: vi.fn(),
    } as unknown as AiDetectorService;

    stageTransitionService = {
      recordTransition: vi.fn().mockResolvedValue({ id: 'log-1' }),
    } as unknown as StageTransitionService;

    worker = new ResumeProcessorWorker(
      storageService,
      prisma,
      resumeParser,
      aiDetector,
      stageTransitionService,
    );
  });

  it('should be defined', () => {
    expect(worker).toBeDefined();
  });

  it('should flag AI-generated resume for recruiter decision without auto-rejecting', async () => {
    const mockApp = {
      id: 'app-1',
      status: ApplicationStatus.ACTIVE,
      currentStageId: 'st-applied',
      currentStage: { id: 'st-applied', name: 'Applied' },
      job: {
        id: 'job-1',
        title: 'Backend Lead',
        pipelineStages: [
          { id: 'st-applied', name: 'Applied' },
          { id: 'st-reject', name: 'Rejected' },
        ],
      },
    };

    vi.spyOn(aiDetector, 'detectAiContent').mockReturnValue({
      isAiGenerated: true,
      overallConfidence: 95,
      verdict: 'AI_GENERATED',
      sectionScores: { summary: 95, projects: 90, experience: 85 },
      flaggedIndicators: ['AI prompt leakage detected'],
      reason: 'AI-written content detected in bio',
    });

    vi.spyOn(prisma.application, 'findFirst').mockResolvedValue(mockApp as any);
    vi.spyOn(prisma.application, 'update').mockResolvedValue({
      id: 'app-1',
      status: ApplicationStatus.ACTIVE,
    } as any);

    const result = await worker.process({
      id: 'job-bull-1',
      data: {
        organizationId: 'org-1',
        applicationId: 'app-1',
        candidateId: 'cand-1',
        resumeKey: 'resumes/org-1/cand-1/resume.pdf',
      },
    } as any);

    expect(result.verdict).toBe('AI_GENERATED');
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            aiDetection: expect.objectContaining({
              isAiGenerated: true,
            }),
          }),
        }),
      }),
    );
  });

  it('should parse details and stamp ATS score when resume is human-written', async () => {
    const mockApp = {
      id: 'app-1',
      status: ApplicationStatus.ACTIVE,
      currentStageId: 'st-applied',
      currentStage: { id: 'st-applied', name: 'Applied' },
      job: {
        id: 'job-1',
        title: 'Backend Lead',
        pipelineStages: [{ id: 'st-applied', name: 'Applied' }],
      },
    };

    vi.spyOn(aiDetector, 'detectAiContent').mockReturnValue({
      isAiGenerated: false,
      overallConfidence: 15,
      verdict: 'HUMAN_WRITTEN',
      sectionScores: { summary: 10, projects: 15, experience: 10 },
      flaggedIndicators: [],
    });

    vi.spyOn(prisma.application, 'findFirst').mockResolvedValue(mockApp as any);
    vi.spyOn(prisma.candidate, 'findFirst').mockResolvedValue({
      id: 'cand-1',
      skills: ['TypeScript'],
    } as any);
    vi.spyOn(prisma.candidate, 'update').mockResolvedValue({} as any);
    vi.spyOn(prisma.application, 'update').mockResolvedValue({} as any);

    const result = await worker.process({
      id: 'job-bull-2',
      data: {
        organizationId: 'org-1',
        applicationId: 'app-1',
        candidateId: 'cand-1',
        resumeKey: 'resumes/org-1/cand-1/resume.pdf',
      },
    } as any);

    expect(result.verdict).toBe('HUMAN_WRITTEN');
    expect(result.atsScore).toBe(88);
    expect(prisma.application.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'app-1' },
        data: expect.objectContaining({
          atsScore: 88,
        }),
      }),
    );
  });
});
