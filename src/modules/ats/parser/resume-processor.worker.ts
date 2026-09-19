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
  ) {
    super();
  }

  async process(job: BullJob<ProcessResumeJobData>): Promise<any> {
    const { organizationId, applicationId, candidateId, resumeKey } = job.data;
    this.logger.log(
      `Processing resume job ${job.id} for Candidate: ${candidateId}, App: ${applicationId}`,
    );

    try {
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
              if (contentType.includes('text/html')) {
                this.logger.warn(`Google Drive link returned HTML page (private or sign-in required): ${driveId}`);
                return { success: false, reason: 'Google Drive link requires authentication / returned HTML page' };
              }
              const arrayBuf = await res.arrayBuffer();
              const buf = Buffer.from(arrayBuf);
              const head = buf.slice(0, 300).toString('utf-8').toLowerCase();
              if (head.includes('<!doctype html') || head.includes('<html') || head.includes('accounts.google.com')) {
                this.logger.warn(`Google Drive link returned HTML web page: ${driveId}`);
                return { success: false, reason: 'Google Drive returned HTML web page' };
              }
              fileBuffer = buf;
            } else {
              throw new Error(`Google Drive download failed with status ${res.status}`);
            }
          }
        } catch (err: any) {
          this.logger.warn(`Worker: Failed to fetch from Google Drive: ${err.message}`);
          return { success: false, reason: 'Failed to download Google Drive file' };
        }
      } else {
        try {
          fileBuffer = await this.storageService.getFileBuffer(resumeKey);
        } catch {
          this.logger.warn(`Resume file not found in storage for key: ${resumeKey}`);
          return { success: false, reason: 'File not found in storage' };
        }
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        this.logger.warn(`Resume buffer for key ${resumeKey} was empty`);
        return { success: false, reason: 'Empty file buffer' };
      }

      // 2. Extract raw text
      const rawText = await this.resumeParser.extractTextFromBuffer(fileBuffer);
      if (!rawText || rawText.trim().length === 0) {
        this.logger.warn(`Failed to extract text from resume ${resumeKey}`);
        return { success: false, reason: 'No text extracted' };
      }

      // Fetch Application (if associated)
      let application = null;
      let targetJob = null;

      if (applicationId) {
        application = await this.prisma.application.findFirst({
          where: { id: applicationId },
          include: {
            job: {
              include: {
                pipelineStages: {
                  orderBy: { order: 'asc' },
                },
              },
            },
            currentStage: true,
          },
        });
        if (application) {
          targetJob = application.job;
        }
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

      // 4. ACTION IF AI-GENERATED: AUTO-REJECT APPLICATION
      if (isAiGenerated && application && targetJob) {
        this.logger.warn(
          `AI-generated resume detected for application ${applicationId} (Confidence: ${aiConfidence}%). Auto-rejecting application.`,
        );

        // Find "Rejected" stage in the job pipeline
        const rejectedStage = targetJob.pipelineStages.find((s) =>
          s.name.toLowerCase().includes('reject'),
        );
        const targetStageId = rejectedStage ? rejectedStage.id : application.currentStageId;
        const targetStageName = rejectedStage ? rejectedStage.name : application.currentStage.name;

        const updatedMetadata = JSON.parse(
          JSON.stringify({
            ...((application.metadata as Record<string, any>) || {}),
            aiDetection: aiDetectionPayload,
            autoRejectedAt: new Date().toISOString(),
          }),
        ) as Prisma.InputJsonValue;

        // Update application to REJECTED
        try {
          await this.prisma.application.update({
            where: { id: applicationId },
            data: {
              status: ApplicationStatus.REJECTED,
              rejectionReason,
              currentStageId: targetStageId,
              metadata: updatedMetadata,
            },
          });
        } catch {
          this.logger.warn(`Application ${applicationId} no longer exists; skipping update`);
          return { success: false, reason: 'Application not found' };
        }

        const effectiveOrgId = organizationId || application.organizationId;

        // Record stage transition audit log
        await this.stageTransitionService.recordTransition({
          organizationId: effectiveOrgId,
          entityType: EntityPipelineType.APPLICATION,
          entityId: applicationId!,
          fromStageId: application.currentStageId,
          fromStageName: application.currentStage.name,
          toStageId: targetStageId,
          toStageName: targetStageName,
          reason: rejectionReason,
          notes: `Auto-rejected by ATS AI Guard (Confidence: ${aiConfidence}%)`,
        });

        return {
          success: true,
          verdict: 'AI_GENERATED',
          status: 'REJECTED',
          aiDetection: aiDetectionPayload,
        };
      }

      // 5. ACTION IF GENUINE: UPDATE CANDIDATE & APPLICATION
      if (candidateId) {
        const effectiveOrgId = organizationId || application?.organizationId;
        const existingCandidate = await this.prisma.candidate.findFirst({
          where: { id: candidateId, ...(effectiveOrgId ? { organizationId: effectiveOrgId } : {}) },
        });

        if (existingCandidate) {
          const mergedSkills = Array.from(
            new Set([...existingCandidate.skills, ...parsedSkills]),
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
            parsedSkills,
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
        verdict: 'HUMAN_WRITTEN',
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
