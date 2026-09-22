-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "CandidateStatus" AS ENUM ('NEW', 'CONTACTED', 'IN_PROCESS', 'HIRED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'HIRED', 'REJECTED', 'WITHDRAWN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "InterviewType" AS ENUM ('PHONE_SCREEN', 'TECHNICAL', 'BEHAVIORAL', 'SYSTEM_DESIGN', 'HR_ROUND', 'MANAGERIAL', 'FINAL_ROUND');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable Organization
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "verifiedDomain" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "sourcingChannels" TEXT[] DEFAULT ARRAY['CAREER_PORTAL', 'LINKEDIN', 'NAUKRI', 'GLASSDOOR', 'UNSTOP', 'INDEED']::TEXT[];

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetPasswordToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "resetPasswordExpires" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_resetPasswordToken_idx" ON "User"("resetPasswordToken");

-- CreateTable Candidate
CREATE TABLE IF NOT EXISTS "Candidate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "headline" TEXT,
    "summary" TEXT,
    "resumeUrl" TEXT,
    "avatarUrl" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "experienceYears" INTEGER,
    "currentCompany" TEXT,
    "currentTitle" TEXT,
    "source" TEXT DEFAULT 'CAREER_PORTAL',
    "status" "CandidateStatus" NOT NULL DEFAULT 'NEW',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable Application
CREATE TABLE IF NOT EXISTS "Application" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "currentStageId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "atsScore" INTEGER,
    "atsFeedback" TEXT,
    "coverLetter" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "hiredAt" TIMESTAMP(3),
    "source" TEXT DEFAULT 'CAREER_PORTAL',
    "utmCampaign" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable StageTransitionLog
CREATE TABLE IF NOT EXISTS "StageTransitionLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT 'APPLICATION',
    "entityId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "performedById" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageTransitionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable Interview
CREATE TABLE IF NOT EXISTS "Interview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "interviewerId" TEXT,
    "title" TEXT NOT NULL,
    "type" "InterviewType" NOT NULL DEFAULT 'TECHNICAL',
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "meetingLink" TEXT,
    "location" TEXT,
    "feedback" TEXT,
    "rating" INTEGER,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- Candidate Indexes
CREATE INDEX IF NOT EXISTS "Candidate_organizationId_idx" ON "Candidate"("organizationId");
CREATE INDEX IF NOT EXISTS "Candidate_organizationId_createdAt_idx" ON "Candidate"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "Candidate_organizationId_source_idx" ON "Candidate"("organizationId", "source");
CREATE INDEX IF NOT EXISTS "Candidate_email_idx" ON "Candidate"("email");
CREATE INDEX IF NOT EXISTS "Candidate_createdAt_idx" ON "Candidate"("createdAt");
DO $$ BEGIN
    CREATE UNIQUE INDEX "Candidate_email_organizationId_key" ON "Candidate"("email", "organizationId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null;
END $$;

-- Application Indexes
CREATE INDEX IF NOT EXISTS "Application_organizationId_idx" ON "Application"("organizationId");
CREATE INDEX IF NOT EXISTS "Application_organizationId_status_idx" ON "Application"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Application_organizationId_appliedAt_idx" ON "Application"("organizationId", "appliedAt");
CREATE INDEX IF NOT EXISTS "Application_candidateId_idx" ON "Application"("candidateId");
CREATE INDEX IF NOT EXISTS "Application_jobId_idx" ON "Application"("jobId");
CREATE INDEX IF NOT EXISTS "Application_jobId_currentStageId_idx" ON "Application"("jobId", "currentStageId");
CREATE INDEX IF NOT EXISTS "Application_currentStageId_idx" ON "Application"("currentStageId");
CREATE INDEX IF NOT EXISTS "Application_status_idx" ON "Application"("status");
CREATE INDEX IF NOT EXISTS "Application_source_idx" ON "Application"("source");
CREATE INDEX IF NOT EXISTS "Application_appliedAt_idx" ON "Application"("appliedAt");
DO $$ BEGIN
    CREATE UNIQUE INDEX "Application_candidateId_jobId_key" ON "Application"("candidateId", "jobId");
EXCEPTION WHEN duplicate_table OR duplicate_object THEN null;
END $$;

-- StageTransitionLog Indexes
CREATE INDEX IF NOT EXISTS "StageTransitionLog_organizationId_idx" ON "StageTransitionLog"("organizationId");
CREATE INDEX IF NOT EXISTS "StageTransitionLog_organizationId_entityId_createdAt_idx" ON "StageTransitionLog"("organizationId", "entityId", "createdAt");
CREATE INDEX IF NOT EXISTS "StageTransitionLog_entityType_entityId_idx" ON "StageTransitionLog"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "StageTransitionLog_createdAt_idx" ON "StageTransitionLog"("createdAt");

-- Interview Indexes
CREATE INDEX IF NOT EXISTS "Interview_organizationId_idx" ON "Interview"("organizationId");
CREATE INDEX IF NOT EXISTS "Interview_organizationId_status_idx" ON "Interview"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "Interview_organizationId_scheduledAt_idx" ON "Interview"("organizationId", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Interview_applicationId_idx" ON "Interview"("applicationId");
CREATE INDEX IF NOT EXISTS "Interview_candidateId_idx" ON "Interview"("candidateId");
CREATE INDEX IF NOT EXISTS "Interview_jobId_idx" ON "Interview"("jobId");
CREATE INDEX IF NOT EXISTS "Interview_interviewerId_idx" ON "Interview"("interviewerId");
CREATE INDEX IF NOT EXISTS "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");
CREATE INDEX IF NOT EXISTS "Interview_status_idx" ON "Interview"("status");

-- Foreign Keys
DO $$ BEGIN
    ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Application" ADD CONSTRAINT "Application_currentStageId_fkey" FOREIGN KEY ("currentStageId") REFERENCES "PipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "StageTransitionLog" ADD CONSTRAINT "StageTransitionLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "StageTransitionLog" ADD CONSTRAINT "StageTransitionLog_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "Interview" ADD CONSTRAINT "Interview_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
