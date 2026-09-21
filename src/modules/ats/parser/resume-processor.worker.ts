import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { Job as BullJob } from 'bullmq';
import { RESUME_QUEUE } from '../../shared/queue/queue.module.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { StageTransitionService } from '../../shared/pipelines/stage-transition.service.js';
import { ResumeParserService } from './resume-parser.service.js';
import { AiDetectorService } from './ai-detector.service.js';
import { GeminiParserService } from './gemini-parser.service.js';
import { CandidateNotificationWorker } from '../notifications/candidate-notification.worker.js';
import { Prisma, ApplicationStatus, EntityPipelineType } from '@prisma/client';

export interface ProcessResumeJobData {
  organizationId: string;
  applicationId?: string;
  candidateId?: string;
  resumeKey: string;
  resumeUrl?: string;
}

@Processor(RESUME_QUEUE)
@Injectable()
export class ResumeProcessorWorker extends WorkerHost {
  private readonly logger = new Logger(ResumeProcessorWorker.name);

  constructor(
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResumeParserService)
    private readonly resumeParser: ResumeParserService,
    @Inject(AiDetectorService)
    private readonly aiDetector: AiDetectorService,
    @Inject(StageTransitionService)
    private readonly stageTransitionService: StageTransitionService,
    @Optional()
    @Inject(GeminiParserService)
    private readonly geminiParser?: GeminiParserService,
    @Optional()
    @Inject(CandidateNotificationWorker)
    private readonly notificationWorker?: CandidateNotificationWorker,
  ) {
    super();
  }

  async process(job: BullJob<ProcessResumeJobData>): Promise<any> {
    const { organizationId, applicationId, candidateId, resumeKey } = job.data;
    this.logger.log(
      `Processing resume job ${job.id} for Candidate: ${candidateId}, App: ${applicationId}`,
    );

    try {
      // Fetch Application (if associated)
      let application = null;
      let targetJob = null;

      if (applicationId) {
        application = await this.prisma.application.findFirst({
          where: { id: applicationId },
          include: {
            candidate: true,
            job: {
              include: {
                pipelineStages: {
                  orderBy: { order: 'asc' },
                },
                organization: true,
              },
            },
            currentStage: true,
          },
        });
        if (application) {
          targetJob = application.job;
        }
      }

      // 1. Fetch file buffer from StorageService or Google Drive
      let fileBuffer: Buffer | null = null;
      if (job.data.resumeUrl && job.data.resumeUrl.includes('drive.google.com')) {
        try {
          const urlObj = new URL(job.data.resumeUrl);
          let driveId = urlObj.searchParams.get('id');
          if (!driveId) {
            const parts = urlObj.pathname.split('/');
            const dIndex = parts.indexOf('d');
            if (dIndex !== -1 && parts.length > dIndex + 1) {
              driveId = parts[dIndex + 1];
            }
          }
          if (driveId) {
            this.logger.log(`Worker: Fetching Google Drive file natively: ${driveId}`);
            const res = await fetch(`https://drive.google.com/uc?export=download&id=${driveId}`);
            if (res.ok) {
              const contentType = res.headers.get('content-type') || '';
              if (!contentType.includes('text/html')) {
                const arrayBuf = await res.arrayBuffer();
                const buf = Buffer.from(arrayBuf);
                const head = buf.slice(0, 300).toString('utf-8').toLowerCase();
                if (!head.includes('<!doctype html') && !head.includes('<html') && !head.includes('accounts.google.com')) {
                  fileBuffer = buf;
                } else {
                  this.logger.warn(`Google Drive link returned HTML web page: ${driveId}`);
                }
              } else {
                this.logger.warn(`Google Drive link returned HTML page (private or sign-in required): ${driveId}`);
              }
            }
          }
        } catch (err: any) {
          this.logger.warn(`Worker: Failed to fetch from Google Drive: ${err.message}`);
        }
      } else if (resumeKey && resumeKey !== 'external') {
        try {
          fileBuffer = await this.storageService.getFileBuffer(resumeKey);
        } catch {
          this.logger.warn(`Resume file not found in storage for key: ${resumeKey}`);
        }
      }

      // 2. Extract raw text
      let rawText = '';
      if (fileBuffer && fileBuffer.length > 0) {
        rawText = await this.resumeParser.extractTextFromBuffer(fileBuffer);
      }

      // Fallback: If resume text could not be extracted (e.g. Google Drive sign-in wall or image PDF),
      // utilize cover letter, candidate notes, and target job keywords to ensure skills extraction.
      if (!rawText || rawText.trim().length === 0) {
        this.logger.warn(`No raw text from buffer for ${resumeKey}. Falling back to application & job context.`);
        const fallbackParts = [
          application?.coverLetter || '',
          application?.candidate?.currentTitle || '',
          targetJob?.title || '',
          targetJob?.description || '',
        ].filter(Boolean);

        rawText = fallbackParts.join('\n');
      }

      if (!rawText || rawText.trim().length === 0) {
        this.logger.warn(`No context or text available to process for resume ${resumeKey}`);
        return { success: false, reason: 'No text extracted' };
      }

      // 3. AI Detection & ATS Parsing (Google Gemini Flash if active, else Local Engine)
      let isAiGenerated = false;
      let aiConfidence = 0;
      let rejectionReason = 'Application automatically rejected: AI-written or AI-assisted content detected in resume';
      let aiDetectionPayload: Record<string, any> = {};
      let parsedSkills: string[] = [];
      let atsScore = 0;
      let candidateExtracted: Record<string, any> = {};
      let atsScoreBreakdown: Record<string, any> = {};

      if (this.geminiParser?.isAiActive() && targetJob) {
        this.logger.log(`Analyzing resume with Google Gemini Flash for job '${targetJob.title}'...`);
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

      // Fallback to local deterministic AI detector if Gemini not active or failed
      if (!aiDetectionPayload.provider) {
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

      // 4. ACTION IF AI-GENERATED: FLAG FOR RECRUITER DECISION (DO NOT AUTO-REJECT)
      if (isAiGenerated && application && targetJob) {
        this.logger.log(
          `AI-generated resume detected for application ${applicationId} (Confidence: ${aiConfidence}%). Flagged for recruiter review without auto-rejecting.`,
        );
      }

      // 5. ACTION: UPDATE CANDIDATE & APPLICATION SKILLS
      const skillsToSave = parsedSkills.length > 0
        ? parsedSkills
        : (Array.isArray(atsScoreBreakdown.matchedSkills) && atsScoreBreakdown.matchedSkills.length > 0)
          ? atsScoreBreakdown.matchedSkills
          : [];

      if (candidateId && skillsToSave.length > 0) {
        const effectiveOrgId = organizationId || application?.organizationId;
        const existingCandidate = await this.prisma.candidate.findFirst({
          where: { id: candidateId, ...(effectiveOrgId ? { organizationId: effectiveOrgId } : {}) },
        });

        if (existingCandidate) {
          const mergedSkills = Array.from(
            new Set([...existingCandidate.skills, ...skillsToSave]),
          );

          await this.prisma.candidate.update({
            where: { id: candidateId },
            data: {
              skills: mergedSkills,
              ...(candidateExtracted.phone && !existingCandidate.phone
                ? { phone: candidateExtracted.phone }
                : {}),
              ...(candidateExtracted.linkedinUrl &&
              !existingCandidate.linkedinUrl
                ? { linkedinUrl: candidateExtracted.linkedinUrl }
                : {}),
              ...(candidateExtracted.githubUrl &&
              !existingCandidate.githubUrl
                ? { githubUrl: candidateExtracted.githubUrl }
                : {}),
            },
          });
        }
      }

      if (application && targetJob) {
        const updatedMetadata = JSON.parse(
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
              metadata: updatedMetadata,
            },
          });
        } catch {
          this.logger.warn(`Application ${applicationId} no longer exists; skipping update`);
          return { success: false, reason: 'Application not found' };
        }

        this.logger.log(
          `Application ${applicationId} parsed successfully. ATS Score: ${atsScore}/100`,
        );
      }

      return {
        success: true,
        verdict: isAiGenerated ? 'AI_GENERATED' : 'HUMAN_WRITTEN',
        atsScore,
        skillsCount: parsedSkills.length,
        aiDetection: aiDetectionPayload,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to process resume job ${job.id}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
