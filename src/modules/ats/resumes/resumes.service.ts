import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
  Logger,
} from '@nestjs/common';
import { StorageService } from '../../shared/storage/storage.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
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

    // Run immediate inline ATS scoring using Google Gemini Flash
    this.runInlineScoring({
      organizationId,
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      resumeKey: key,
      resumeUrl: url,
      candidateId,
      applicationId,
      jobId,
    }).catch((err: any) => this.logger.error(`Inline scoring error: ${err.message}`, err.stack));

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

    // Run immediate inline Gemini AI scoring
    if (dto.key || dto.resumeUrl) {
      this.storageService
        .getFileBuffer(dto.key || '')
        .then((fileBuffer) =>
          this.runInlineScoring({
            organizationId,
            fileBuffer,
            resumeKey: dto.key || 'external',
            resumeUrl: dto.resumeUrl,
            candidateId: dto.candidateId,
            applicationId: dto.applicationId,
          }),
        )
        .catch(() =>
          this.runInlineScoring({
            organizationId,
            resumeKey: dto.key || 'external',
            resumeUrl: dto.resumeUrl,
            candidateId: dto.candidateId,
            applicationId: dto.applicationId,
          }),
        )
        .catch((err: any) => this.logger.warn(`Inline scoring on attachResume failed: ${err.message}`));
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
    jobId?: string;
  }): Promise<void> {
    const { organizationId, mimeType, resumeKey, candidateId, applicationId, jobId } = opts;

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
              this.logger.log(`Inline scoring: Fetching Google Drive file: ${driveId}`);
              try {
                const res = await fetch(`https://drive.google.com/uc?export=download&id=${driveId}`);
                if (res.ok) {
                  const contentType = res.headers.get('content-type') || '';
                  if (!contentType.includes('text/html')) {
                    const arrayBuf = await res.arrayBuffer();
                    const buf = Buffer.from(arrayBuf);
                    const head = buf.slice(0, 300).toString('utf-8').toLowerCase();
                    if (!head.includes('<!doctype html') && !head.includes('<html') && !head.includes('accounts.google.com')) {
                      fileBuffer = buf;
                    }
                  }
                }
              } catch (driveErr: any) {
                this.logger.warn(`Inline scoring: Google Drive direct fetch skipped: ${driveErr.message}`);
              }
            }
          } catch (err: any) {
            this.logger.warn(`Inline scoring: Google Drive URL parsing error: ${err.message}`);
          }
        } else if (resumeKey && resumeKey !== 'candidate-profile-context' && resumeKey !== 'external') {
          try {
            fileBuffer = await this.storageService.getFileBuffer(resumeKey);
          } catch {
            this.logger.warn(`Inline scoring: file not found in storage for key: ${resumeKey}`);
          }
        }

        // If still no fileBuffer, try opts.resumeUrl
        if (!fileBuffer && opts.resumeUrl && !opts.resumeUrl.includes('drive.google.com')) {
          try {
            fileBuffer = await this.storageService.getFileBuffer(opts.resumeUrl);
          } catch {
            if (opts.resumeUrl.startsWith('http')) {
              try {
                const res = await fetch(opts.resumeUrl);
                if (res.ok) {
                  const contentType = res.headers.get('content-type') || '';
                  if (!contentType.includes('text/html')) {
                    const arrayBuf = await res.arrayBuffer();
                    fileBuffer = Buffer.from(arrayBuf);
                  }
                }
              } catch (fetchErr: any) {
                this.logger.warn(`Inline scoring: direct fetch of resumeUrl failed: ${fetchErr.message}`);
              }
            }
          }
        }
      }

      // 2. Extract raw text from buffer if available
      let rawText = '';
      let hasRealResume = false;
      if (fileBuffer && fileBuffer.length > 0) {
        try {
          rawText = await this.resumeParser.extractTextFromBuffer(fileBuffer, mimeType);
          if (rawText && rawText.trim().length >= 20) {
            hasRealResume = true;
          }
        } catch (err: any) {
          this.logger.warn(`Inline scoring: failed buffer extraction: ${err.message}`);
        }
      }

      // 3. Fetch application + job context
      let application: any = null;
      let targetJob: any = null;

      if (applicationId) {
        application = await this.prisma.application.findFirst({
          where: { id: applicationId },
          include: {
            candidate: true,
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

      if (!targetJob && jobId) {
        targetJob = await this.prisma.job.findUnique({
          where: { id: jobId },
          include: { pipelineStages: { orderBy: { order: 'asc' } } },
        });
      }

      if (!application && candidateId && targetJob) {
        application = await this.prisma.application.findFirst({
          where: { candidateId, jobId: targetJob.id },
          include: {
            candidate: true,
            job: true,
            currentStage: true,
          },
        });
      }

      // If application exists but targetJob wasn't loaded, try finding candidate's latest active job
      if (!targetJob && candidateId) {
        const candidateWithApps = await this.prisma.candidate.findUnique({
          where: { id: candidateId },
          include: {
            applications: {
              include: { job: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        if (candidateWithApps?.applications?.[0]?.job) {
          targetJob = candidateWithApps.applications[0].job;
          if (!application) {
            application = candidateWithApps.applications[0];
          }
        }
      }

      // Fallback: If resume text could not be extracted, synthesize only from candidate profile context (NEVER include job description so skills aren't fabricated)
      if (!rawText || rawText.trim().length < 20) {
        this.logger.log(`Inline scoring: synthesizing candidate profile context for scoring`);
        const cand = candidateId
          ? await this.prisma.candidate.findUnique({ where: { id: candidateId } })
          : application?.candidate;

        const candidateName = cand ? `${cand.firstName} ${cand.lastName}`.trim() : '';
        const fallbackParts = [
          candidateName ? `Candidate Name: ${candidateName}` : '',
          cand?.currentTitle ? `Current Title / Role: ${cand.currentTitle}` : '',
          cand?.currentCompany ? `Current Company: ${cand.currentCompany}` : '',
          cand?.location ? `Location: ${cand.location}` : '',
          cand?.phone ? `Phone: ${cand.phone}` : '',
          cand?.email ? `Email: ${cand.email}` : '',
          cand?.source ? `Sourcing Channel: ${cand.source}` : '',
          application?.coverLetter ? `Cover Letter / Statement: ${application.coverLetter}` : '',
        ].filter(Boolean);

        rawText = fallbackParts.join('\n\n');
      }

      if (!rawText || rawText.trim().length === 0) {
        this.logger.warn(`Inline scoring: no text available for key: ${resumeKey}`);
        return;
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

      // 6. Update candidate skills (STRICT: ONLY FROM ACTUAL RESUME)
      const skillsToSave = (hasRealResume && parsedSkills.length > 0)
        ? parsedSkills
        : [];

      if (candidateId && hasRealResume) {
        const existingCandidate = await this.prisma.candidate.findFirst({
          where: { id: candidateId, ...(organizationId ? { organizationId } : {}) },
        });

        if (existingCandidate) {
          // Overwrite with clean skills strictly extracted from the resume
          await this.prisma.candidate.update({
            where: { id: candidateId },
            data: {
              skills: skillsToSave,
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
      if (application) {
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
            where: { id: application.id },
            data: {
              atsScore,
              metadata: updatedMeta,
            },
          });
          this.logger.log(
            `Inline scoring complete for application ${application.id}. ATS Score: ${atsScore}/100 (provider: ${aiDetectionPayload.provider})`,
          );
        } catch (err: any) {
          this.logger.warn(`Inline scoring: application ${application.id} not found during score update: ${err.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Inline scoring failed for key ${resumeKey}: ${error.message}`, error.stack);
    }
  }

  /**
   * Re-extracts skills and ATS scores for all candidates in the organization strictly from their resume documents.
   */
  async reExtractAllCandidateSkills(organizationId: string): Promise<{
    totalCandidates: number;
    processed: number;
    updated: number;
    errors: string[];
  }> {
    this.logger.log(`Starting bulk resume re-extraction for organization: ${organizationId}`);

    const candidates = await this.prisma.candidate.findMany({
      where: { organizationId },
      include: {
        applications: {
          include: {
            job: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    let processed = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const cand of candidates) {
      processed++;
      try {
        const activeApp = cand.applications[0];
        const rawMeta = (activeApp?.metadata as Record<string, any>) || {};
        const rawResume =
          cand.resumeUrl ||
          rawMeta.resumeUrl ||
          rawMeta.resumeKey ||
          '';

        if (!rawResume) {
          continue;
        }

        let resolvedResumeKey = '';
        if (rawResume.includes('resumes/')) {
          const parts = rawResume.split('resumes/');
          resolvedResumeKey = 'resumes/' + parts[parts.length - 1].split('?')[0];
        } else if (rawResume && !rawResume.startsWith('http')) {
          resolvedResumeKey = rawResume
            .replace(/^\/?storage\//, '')
            .replace(/^\\?storage\\/, '')
            .replace(/^[/\\]+/, '')
            .split('?')[0];
        }

        const effectiveResumeKey =
          resolvedResumeKey ||
          (rawResume.includes('drive.google.com') ? 'google-drive-link' : 'candidate-profile-context');

        await this.runInlineScoring({
          organizationId,
          resumeKey: effectiveResumeKey,
          resumeUrl: rawResume,
          candidateId: cand.id,
          applicationId: activeApp?.id,
          jobId: activeApp?.jobId,
        });

        updated++;
      } catch (err: any) {
        this.logger.error(`Failed to re-extract skills for candidate ${cand.id}: ${err.message}`);
        errors.push(`Candidate ${cand.firstName} ${cand.lastName}: ${err.message}`);
      }
    }

    this.logger.log(
      `Finished bulk resume re-extraction for org ${organizationId}: ${updated}/${processed} processed.`,
    );

    return {
      totalCandidates: candidates.length,
      processed,
      updated,
      errors,
    };
  }
}
