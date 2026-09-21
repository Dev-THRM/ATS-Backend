import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { StorageService } from '../../shared/storage/storage.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { RESUME_QUEUE } from '../../shared/queue/queue.module.js';
import { GetPresignedUrlDto } from './dto/get-presigned-url.dto.js';
import { AttachResumeDto } from './dto/attach-resume.dto.js';
import { ResumeParserService } from '../parser/resume-parser.service.js';
import { AiDetectorService } from '../parser/ai-detector.service.js';
import { GeminiParserService } from '../parser/gemini-parser.service.js';
import { Prisma, ApplicationStatus } from '@prisma/client';
import * as path from 'node:path';
import 'multer';

export class UploadedResumeFile {
  originalname!: string;
  mimetype!: string;
  size!: number;
  buffer!: Buffer;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

import { CandidateNotificationWorker } from '../notifications/candidate-notification.worker.js';

@Injectable()
export class ResumesService {
  private readonly logger = new Logger(ResumesService.name);

  constructor(
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResumeParserService) private readonly resumeParser: ResumeParserService,
    @Inject(AiDetectorService) private readonly aiDetector: AiDetectorService,
    @Optional() @Inject(GeminiParserService) private readonly geminiParser?: GeminiParserService,
    @Optional() @InjectQueue(RESUME_QUEUE) private readonly resumeQueue?: Queue,
    @Optional()
    @Inject(CandidateNotificationWorker)
    private readonly notificationWorker?: CandidateNotificationWorker,
  ) {}

  /**
   * Generates a tenant-partitioned pre-signed upload URL for direct client-to-R2 upload.
   */
  async getPresignedUploadUrl(
    organizationId: string,
    dto: GetPresignedUrlDto,
  ) {
    const ext = path.extname(dto.fileName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Invalid file extension '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    const sanitizedName = path
      .basename(dto.fileName)
      .replace(/[^a-zA-Z0-9.-]/g, '_');
    const folder = dto.candidateId ? dto.candidateId : 'temp';
    const key = `resumes/${organizationId}/${folder}/${Date.now()}-${sanitizedName}`;

    const presigned = await this.storageService.generatePresignedUploadUrl(
      key,
      dto.contentType || 'application/pdf',
    );

    return {
      ...presigned,
      organizationId,
      candidateId: dto.candidateId,
      jobId: dto.jobId,
    };
  }

  /**
   * Direct multipart file upload via NestJS server.
   */
  async uploadDirect(
    organizationId: string,
    file: UploadedResumeFile,
    candidateId?: string,
    jobId?: string,
    applicationId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No resume file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Invalid file extension '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    const sanitizedName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9.-]/g, '_');
    const folder = candidateId ? candidateId : 'temp';
    const key = `resumes/${organizationId}/${folder}/${Date.now()}-${sanitizedName}`;

    const { url } = await this.storageService.uploadBuffer({
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
      metadata: {
        organizationId,
        originalName: file.originalname,
        ...(candidateId && { candidateId }),
        ...(jobId && { jobId }),
      },
    });

    // If candidateId was provided, automatically update Candidate.resumeUrl
    if (candidateId) {
      const candidate = await this.prisma.candidate.findFirst({
        where: { id: candidateId, organizationId },
      });
      if (candidate) {
        await this.prisma.candidate.update({
          where: { id: candidateId },
          data: { resumeUrl: url },
        });
      }
    }

    // If applicationId was provided, automatically update Application.metadata
    if (applicationId) {
      const application = await this.prisma.application.findFirst({
        where: { id: applicationId, organizationId },
      });
      if (application) {
        const metadata = (application.metadata as Record<string, any>) || {};
        await this.prisma.application.update({
          where: { id: applicationId },
          data: {
            metadata: {
              ...metadata,
              resumeKey: key,
              resumeUrl: url,
            },
          },
        });
      }
    }

    // Enqueue background parsing job via Redis/BullMQ, or fall back to inline scoring
    let queuedSuccessfully = false;
    if (this.resumeQueue) {
      try {
        await this.resumeQueue.add('parse-resume', {
          organizationId,
          candidateId,
          jobId,
          applicationId,
          resumeKey: key,
          resumeUrl: url,
        });
        queuedSuccessfully = true;
        this.logger.log(`Resume parse job queued via BullMQ for key: ${key}`);
      } catch (queueErr: any) {
        this.logger.warn(
          `BullMQ queue unavailable (${queueErr.message}). Running inline scoring fallback.`,
        );
      }
    }

    if (!queuedSuccessfully) {
      this.logger.log(`Running inline ATS scoring fallback for key: ${key}`);
      // Run asynchronously so the upload response is not blocked
      this.runInlineScoring({
        organizationId,
        fileBuffer: file.buffer,
        mimeType: file.mimetype,
        resumeKey: key,
        resumeUrl: url,
        candidateId,
        applicationId,
      }).catch((err: any) => this.logger.error(`Inline scoring error: ${err.message}`, err.stack));
    }

    return {
      message: 'Resume uploaded successfully and processed for AI parsing',
      key,
      url,
      resumeUrl: url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Generates a temporary secure pre-signed download URL.
   */
  async getDownloadUrl(organizationId: string, key: string) {
    if (!key.startsWith(`resumes/${organizationId}/`)) {
      throw new BadRequestException(
        'Access denied: You can only access resumes in your organization',
      );
    }

    const downloadUrl = await this.storageService.generatePresignedDownloadUrl(
      key,
      3600,
    );

    return {
      key,
      downloadUrl,
      expiresInSeconds: 3600,
    };
  }

  /**
   * Attaches an uploaded resume URL/key to a Candidate profile and optional Application record.
   */
  async attachResume(organizationId: string, dto: AttachResumeDto) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, organizationId },
    });

    if (!candidate) {
      throw new NotFoundException(
        `Candidate with ID '${dto.candidateId}' not found`,
      );
    }

    const updatedCandidate = await this.prisma.candidate.update({
      where: { id: dto.candidateId },
      data: { resumeUrl: dto.resumeUrl },
    });

    let updatedApplication = null;
    if (dto.applicationId) {
      const application = await this.prisma.application.findFirst({
        where: { id: dto.applicationId, organizationId },
      });
      if (application) {
        const metadata = (application.metadata as Record<string, any>) || {};
        updatedApplication = await this.prisma.application.update({
          where: { id: dto.applicationId },
          data: {
            metadata: {
              ...metadata,
              resumeUrl: dto.resumeUrl,
              resumeKey: dto.key,
            },
          },
        });
      }
    }

    // Enqueue parsing job if key is provided, or fall back to inline scoring
    if (dto.key) {
      let queuedSuccessfully = false;
      if (this.resumeQueue) {
        try {
          await this.resumeQueue.add('parse-resume', {
            organizationId,
            candidateId: dto.candidateId,
            applicationId: dto.applicationId,
            resumeKey: dto.key,
            resumeUrl: dto.resumeUrl,
          });
          queuedSuccessfully = true;
        } catch (queueErr: any) {
          this.logger.warn(
            `BullMQ queue unavailable on attachResume (${queueErr.message}). Running inline scoring fallback.`,
          );
        }
      }

      if (!queuedSuccessfully) {
        this.storageService
          .getFileBuffer(dto.key)
          .then((fileBuffer) =>
            this.runInlineScoring({
              organizationId,
              fileBuffer,
              resumeKey: dto.key!,
              resumeUrl: dto.resumeUrl,
              candidateId: dto.candidateId,
              applicationId: dto.applicationId,
            }),
          )
          .catch((err: any) => this.logger.warn(`Inline scoring on attachResume failed: ${err.message}`));
      }
    }

    return {
      message: 'Resume attached successfully',
      candidate: updatedCandidate,
      application: updatedApplication,
    };
  }

  /**
   * Retrieves raw resume Buffer from storage (for BullMQ resume parser).
   */
  async getResumeBuffer(key: string): Promise<Buffer> {
    return this.storageService.getFileBuffer(key);
  }

  /**
   * Runs the full ATS scoring pipeline synchronously — Gemini Flash first, local engine fallback.
   * Called automatically when Redis/BullMQ is unavailable.
   * Can also be invoked directly (e.g. from ApplicationsService.reparseApplication).
   */
  async runInlineScoring(opts: {
    organizationId: string;
    fileBuffer?: Buffer;
    mimeType?: string;
    resumeKey: string;
    resumeUrl?: string;
    candidateId?: string;
    applicationId?: string;
  }): Promise<void> {
    const { organizationId, mimeType, resumeKey, candidateId, applicationId } = opts;

    try {
      // 1. Get file buffer (may already be provided from upload, else fetch from storage)
      let fileBuffer = opts.fileBuffer;
      if (!fileBuffer || fileBuffer.length === 0) {
        if (opts.resumeUrl && opts.resumeUrl.includes('drive.google.com')) {
          try {
            const urlObj = new URL(opts.resumeUrl);
            let driveId = urlObj.searchParams.get('id');
            if (!driveId) {
              const parts = urlObj.pathname.split('/');
              const dIndex = parts.indexOf('d');
              if (dIndex !== -1 && parts.length > dIndex + 1) {
                driveId = parts[dIndex + 1];
              }
            }
            if (driveId) {
              this.logger.log(`Inline scoring: Fetching Google Drive file natively: ${driveId}`);
              const res = await fetch(`https://drive.google.com/uc?export=download&id=${driveId}`);
              if (res.ok) {
                const contentType = res.headers.get('content-type') || '';
                if (contentType.includes('text/html')) {
                  this.logger.warn(`Google Drive link returned HTML page (private or sign-in required): ${driveId}`);
                  return;
                }
                const arrayBuf = await res.arrayBuffer();
                const buf = Buffer.from(arrayBuf);
                const head = buf.slice(0, 300).toString('utf-8').toLowerCase();
                if (head.includes('<!doctype html') || head.includes('<html') || head.includes('accounts.google.com')) {
                  this.logger.warn(`Google Drive link returned HTML web page: ${driveId}`);
                  return;
                }
                fileBuffer = buf;
              } else {
                throw new Error(`Google Drive download failed with status ${res.status}`);
              }
            }
          } catch (err: any) {
            this.logger.warn(`Inline scoring: Failed to fetch from Google Drive: ${err.message}`);
            return;
          }
        } else {
          try {
            fileBuffer = await this.storageService.getFileBuffer(resumeKey);
          } catch {
            this.logger.warn(`Inline scoring: file not found in storage for key: ${resumeKey}`);
            return;
          }
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        this.logger.warn(`Inline scoring: empty buffer for key: ${resumeKey}`);
        return;
      }

      // 2. Extract raw text
      const rawText = await this.resumeParser.extractTextFromBuffer(fileBuffer, mimeType);
      if (!rawText || rawText.trim().length === 0) {
        this.logger.warn(`Inline scoring: no text extracted from ${resumeKey}`);
        return;
      }

      // 3. Fetch application + job context if available
      let application: any = null;
      let targetJob: any = null;

      if (applicationId) {
        application = await this.prisma.application.findFirst({
          where: { id: applicationId },
          include: {
            job: {
              include: {
                pipelineStages: { orderBy: { order: 'asc' } },
              },
            },
            currentStage: true,
          },
        });
        if (application) targetJob = application.job;
      }

      // 4. Score: Gemini Flash first, local engine fallback
      let isAiGenerated = false;
      let aiConfidence = 0;
      let parsedSkills: string[] = [];
      let atsScore = 0;
      let candidateExtracted: Record<string, any> = {};
      let atsScoreBreakdown: Record<string, any> = {};
      let aiDetectionPayload: Record<string, any> = {};
      let rejectionReason = 'Application automatically rejected: AI-written content detected in resume';

      if (this.geminiParser?.isAiActive() && targetJob) {
        this.logger.log(`Inline scoring: using Google Gemini Flash for job '${targetJob.title}'`);
        const geminiResult = await this.geminiParser.analyzeResumeWithGemini(rawText, targetJob);

        if (geminiResult) {
          isAiGenerated = geminiResult.isAiGenerated;
          aiConfidence = geminiResult.aiConfidence;
          if (geminiResult.aiDetectionReason) {
            rejectionReason = `Application automatically rejected: ${geminiResult.aiDetectionReason}`;
          }
          aiDetectionPayload = {
            isAiGenerated,
            confidence: aiConfidence,
            verdict: isAiGenerated ? 'AI_GENERATED' : 'HUMAN_WRITTEN',
            provider: 'GOOGLE_GEMINI_FLASH',
            flaggedSections: geminiResult.flaggedSections,
            reason: geminiResult.aiDetectionReason,
          };
          let extractedSkills: string[] = [];
          if (Array.isArray(geminiResult.skills)) {
            extractedSkills = geminiResult.skills.map((s) => String(s));
          } else if (geminiResult.skills && typeof geminiResult.skills === 'object') {
            extractedSkills = Object.values(geminiResult.skills)
              .flat()
              .map((s) => String(s));
          }
          parsedSkills = extractedSkills;
          atsScore = geminiResult.atsScore || 0;
          candidateExtracted = geminiResult.candidateInfo || {};
          if ((geminiResult.candidateInfo as any)?.name && !candidateExtracted.firstName) {
            const parts = String((geminiResult.candidateInfo as any).name).trim().split(/\s+/);
            candidateExtracted.firstName = parts[0];
            candidateExtracted.lastName = parts.slice(1).join(' ') || undefined;
          }
          atsScoreBreakdown = {
            score: atsScore,
            matchedSkills: Array.isArray(geminiResult.matchedSkills) ? geminiResult.matchedSkills : [],
            missingSkills: Array.isArray(geminiResult.missingSkills) ? geminiResult.missingSkills : [],
            breakdown: geminiResult.scoreBreakdown || {},
          };
        }
      }

      // Fallback to local deterministic engine if Gemini not active or Gemini call failed
      if (!aiDetectionPayload.provider) {
        this.logger.log(`Inline scoring: using local deterministic engine for key: ${resumeKey}`);
        const localAiDetection = this.aiDetector.detectAiContent(rawText);
        isAiGenerated = localAiDetection.isAiGenerated;
        aiConfidence = localAiDetection.overallConfidence;
        if (localAiDetection.reason) {
          rejectionReason = `AI-Generated Resume Detected: ${localAiDetection.reason}`;
        }
        aiDetectionPayload = {
          ...localAiDetection,
          provider: 'LOCAL_SEMANTIC_ENGINE',
        };

        const localParsed = this.resumeParser.parseResumeText(rawText);
        parsedSkills = localParsed.skills;
        candidateExtracted = localParsed.candidateInfo;

        if (targetJob) {
          const localAts = this.resumeParser.calculateAtsScore(localParsed, targetJob);
          atsScore = localAts.score;
          atsScoreBreakdown = localAts;
        }
      }

      // 5. Flag AI-generated resume for recruiter decision (do not auto-reject)
      if (isAiGenerated && application && targetJob) {
        this.logger.log(
          `Inline scoring: AI-generated resume flagged (confidence: ${aiConfidence}%). Flagged for recruiter review without auto-rejecting.`,
        );
      }

      // 6. Merge and update candidate skills
      const skillsToSave = parsedSkills.length > 0
        ? parsedSkills
        : (Array.isArray(atsScoreBreakdown.matchedSkills) && atsScoreBreakdown.matchedSkills.length > 0)
          ? atsScoreBreakdown.matchedSkills
          : [];

      if (candidateId && skillsToSave.length > 0) {
        const existingCandidate = await this.prisma.candidate.findFirst({
          where: { id: candidateId, ...(organizationId ? { organizationId } : {}) },
        });

        if (existingCandidate) {
          const mergedSkills = Array.from(new Set([...existingCandidate.skills, ...skillsToSave]));
          await this.prisma.candidate.update({
            where: { id: candidateId },
            data: {
              skills: mergedSkills,
              ...(candidateExtracted.phone && !existingCandidate.phone
                ? { phone: candidateExtracted.phone }
                : {}),
              ...(candidateExtracted.linkedinUrl && !existingCandidate.linkedinUrl
                ? { linkedinUrl: candidateExtracted.linkedinUrl }
                : {}),
              ...(candidateExtracted.githubUrl && !existingCandidate.githubUrl
                ? { githubUrl: candidateExtracted.githubUrl }
                : {}),
            },
          });
        }
      }

      // 7. Write ATS score + full metadata back to the application
      if (application && targetJob) {
        const updatedMeta = JSON.parse(
          JSON.stringify({
            ...((application.metadata as Record<string, any>) || {}),
            parsedSkills: skillsToSave,
            atsScoreBreakdown,
            aiDetection: aiDetectionPayload,
          }),
        ) as Prisma.InputJsonValue;

        try {
          await this.prisma.application.update({
            where: { id: applicationId },
            data: {
              atsScore,
              metadata: updatedMeta,
            },
          });
          this.logger.log(
            `Inline scoring complete for application ${applicationId}. ATS Score: ${atsScore}/100 (provider: ${aiDetectionPayload.provider})`,
          );
        } catch {
          this.logger.warn(`Inline scoring: application ${applicationId} not found during score update`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Inline scoring failed for key ${resumeKey}: ${error.message}`, error.stack);
    }
  }
}
