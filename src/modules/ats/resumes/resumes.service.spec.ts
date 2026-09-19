import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResumesService, UploadedResumeFile } from './resumes.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { ResumeParserService } from '../parser/resume-parser.service.js';
import { AiDetectorService } from '../parser/ai-detector.service.js';
import { BadRequestException } from '@nestjs/common';

describe('ResumesService', () => {
  let service: ResumesService;
  let storageService: StorageService;
  let prisma: PrismaService;

  const mockOrgId = 'org-123';

  beforeEach(() => {
    storageService = {
      generatePresignedUploadUrl: vi.fn().mockResolvedValue({
        uploadUrl: 'https://r2.example.com/upload',
        key: 'resumes/org-123/cand-1/123-resume.pdf',
        expiresInSeconds: 3600,
      }),
      generatePresignedDownloadUrl: vi
        .fn()
        .mockResolvedValue('https://r2.example.com/download'),
      uploadBuffer: vi.fn().mockResolvedValue({
        key: 'resumes/org-123/cand-1/123-resume.pdf',
        url: 'https://cdn.example.com/resumes/org-123/cand-1/123-resume.pdf',
      }),
      getFileBuffer: vi.fn().mockResolvedValue(Buffer.from('PDF Content')),
    } as unknown as StorageService;

    prisma = {
      candidate: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      application: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaService;

    const mockResumeParser = {
      extractTextFromBuffer: vi.fn().mockResolvedValue('mock resume text'),
      parseResumeText: vi.fn().mockReturnValue({ skills: [], candidateInfo: {}, experienceYears: 0, education: [], rawText: '' }),
      calculateAtsScore: vi.fn().mockReturnValue({ score: 0, matchedSkills: [], missingSkills: [], experienceMatchScore: 0, titleRelevanceScore: 0, breakdown: {} }),
    } as unknown as ResumeParserService;

    const mockAiDetector = {
      detectAiContent: vi.fn().mockReturnValue({ isAiGenerated: false, overallConfidence: 0 }),
    } as unknown as AiDetectorService;

    service = new ResumesService(storageService, prisma, mockResumeParser, mockAiDetector);
  });


  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate pre-signed upload URL for valid PDF', async () => {
    const result = await service.getPresignedUploadUrl(mockOrgId, {
      fileName: 'developer-resume.pdf',
      candidateId: 'cand-1',
    });

    expect(result.uploadUrl).toBeDefined();
    expect(storageService.generatePresignedUploadUrl).toHaveBeenCalled();
  });

  it('should reject invalid file extensions like .exe or .zip', async () => {
    await expect(
      service.getPresignedUploadUrl(mockOrgId, {
        fileName: 'malicious.exe',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should upload direct file and update candidate resumeUrl', async () => {
    const mockFile: UploadedResumeFile = {
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('mock pdf'),
    };

    vi.spyOn(prisma.candidate, 'findFirst').mockResolvedValue({
      id: 'cand-1',
      email: 'alex@example.com',
    } as any);

    vi.spyOn(prisma.candidate, 'update').mockResolvedValue({
      id: 'cand-1',
      resumeUrl:
        'https://cdn.example.com/resumes/org-123/cand-1/123-resume.pdf',
    } as any);

    const result = await service.uploadDirect(
      mockOrgId,
      mockFile,
      'cand-1',
    );

    expect(result.message).toContain('Resume uploaded successfully');
    expect(result.resumeUrl).toBeDefined();
    expect(prisma.candidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cand-1' },
      }),
    );
  });
});
