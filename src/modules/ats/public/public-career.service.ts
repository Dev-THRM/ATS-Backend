import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { JobStatus } from '@prisma/client';
import { PublicApplyJobDto } from './dto/public-apply.dto.js';

@Injectable()
export class PublicCareerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(ApplicationsService)
    private readonly applicationsService: ApplicationsService,
    @Inject(CandidatesService)
    private readonly candidatesService: CandidatesService,
  ) {}

  /**
   * Checks if a candidate with given email has already applied to a specific job.
   */
  async checkApplied(orgSlug: string, jobId: string, email?: string) {
    if (!email) {
      return { alreadyApplied: false };
    }

    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!org) {
      return { alreadyApplied: false };
    }

    const candidate = await this.prisma.candidate.findUnique({
      where: {
        email_organizationId: {
          email: email.toLowerCase().trim(),
          organizationId: org.id,
        },
      },
    });

    if (!candidate) {
      return { alreadyApplied: false };
    }

    const existingApp = await this.prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId,
        },
      },
      select: {
        id: true,
        appliedAt: true,
        status: true,
      },
    });

    if (existingApp) {
      return {
        alreadyApplied: true,
        appliedAt: existingApp.appliedAt,
        status: existingApp.status,
      };
    }

    return { alreadyApplied: false };
  }

  /**
   * Retrieves organization info and published open job postings for candidate public career page.
   */
  async getPublicJobs(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        website: true,
        isVerified: true,
        verifiedDomain: true,
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const jobs = await this.prisma.job.findMany({
      where: {
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
      select: {
        id: true,
        title: true,
        department: true,
        location: true,
        employmentType: true,
        experienceMin: true,
        experienceMax: true,
        experienceLevel: true,
        salaryMin: true,
        salaryMax: true,
        description: true,
        salaryCurrency: true,
        salaryVisible: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      organization: org,
      totalJobs: jobs.length,
      jobs,
    };
  }

  /**
   * Retrieves full public description for a single open job posting.
   */
  async getPublicJobDetails(orgSlug: string, jobId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        website: true,
        isVerified: true,
        verifiedDomain: true,
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job posting not found or no longer open`);
    }

    return {
      organization: org,
      job,
    };
  }

  /**
   * Allows public external candidates to submit an application with resume upload.
   */
  async applyPublic(
    orgSlug: string,
    jobId: string,
    dto: PublicApplyJobDto,
    file?: Express.Multer.File,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
    });

    if (!job) {
      throw new BadRequestException('Cannot apply: job is not currently open');
    }

    // Check duplicate application
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existingCandidate = await this.prisma.candidate.findUnique({
      where: {
        email_organizationId: {
          email: normalizedEmail,
          organizationId: org.id,
        },
      },
    });

    if (existingCandidate) {
      const existingApp = await this.prisma.application.findUnique({
        where: {
          candidateId_jobId: {
            candidateId: existingCandidate.id,
            jobId: job.id,
          },
        },
      });

      if (existingApp) {
        throw new ConflictException(
          'You have already submitted an application for this position. Multiple applications for the same role are not permitted.',
        );
      }
    }

    let resumeKey: string | null = null;
    let resumeUrl: string | null = null;

    if (file) {
      const sanitizedName = (file.originalname || 'resume.pdf').replace(
        /[^a-zA-Z0-9.-]/g,
        '_',
      );
      resumeKey = `resumes/${org.id}/public/${Date.now()}-${sanitizedName}`;
      const uploadResult = await this.storageService.uploadBuffer({
        key: resumeKey,
        buffer: file.buffer,
        contentType: file.mimetype,
        metadata: {
          organizationId: org.id,
          originalName: file.originalname,
          source: 'PUBLIC_CAREER_PORTAL',
        },
      });
      resumeUrl = uploadResult.url;
    }

    const effectiveSource = (dto.source || dto.utmSource || 'CAREER_PORTAL').toUpperCase().trim();

    // 1. Create or update candidate record with dynamic source attribution
    const candidate = await this.candidatesService.findOrCreate(org.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      currentCompany: dto.currentCompany,
      currentTitle: dto.currentTitle || job.title || 'Applicant',
      location: dto.location,
      linkedinUrl: dto.linkedinUrl,
      portfolioUrl: dto.portfolioUrl,
      githubUrl: dto.githubUrl,
      skills: dto.skills || [],
      source: effectiveSource,
      resumeUrl: resumeUrl || undefined,
    });

    // 2. Submit application & trigger async BullMQ parser + candidate WhatsApp confirmation
    const application = await this.applicationsService.create(org.id, {
      jobId: job.id,
      candidateId: candidate.id,
      coverLetter: dto.coverLetter,
      source: effectiveSource,
      utmSource: dto.utmSource,
      utmMedium: dto.utmMedium,
      utmCampaign: dto.utmCampaign,
      metadata: {
        ...(resumeKey ? { resumeKey, resumeUrl } : {}),
        appliedVia: effectiveSource,
        sourceChannel: effectiveSource,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
      },
    });

    return {
      message: 'Application submitted successfully',
      applicationId: application.id,
      candidateId: candidate.id,
      jobTitle: job.title,
      source: effectiveSource,
    };
  }

  /**
  /**
   * Headless JSON candidate ingestion endpoint for third-party job boards & webhook integrations
   * (e.g. Google Forms, LinkedIn Easy Apply webhook, Naukri applicant integration, Unstop API).
   */
  async ingestCandidate(
    orgSlug: string,
    jobId?: string,
    dto?: Record<string, any>,
  ) {
    if (!dto) {
      throw new BadRequestException('Application payload is required');
    }

    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      include: {
        jobs: {
          where: { status: JobStatus.OPEN },
          include: { pipelineStages: { orderBy: { order: 'asc' }, take: 1 } },
        },
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    if (!org.jobs || org.jobs.length === 0) {
      throw new BadRequestException('Organization has no currently open jobs');
    }

    const raw = (dto || {}) as Record<string, any>;

    // 1. Normalize Email
    const email = (
      raw.email ||
      raw['Email'] ||
      raw['Email Address'] ||
      raw['email address'] ||
      raw['emailAddress'] ||
      raw['candidateEmail'] ||
      ''
    ).trim().toLowerCase();

    if (!email) {
      throw new BadRequestException('A valid email address is required');
    }

    // 2. Normalize First and Last Name
    let firstName = (raw.firstName || raw['First Name'] || raw['first_name'] || '').trim();
    let lastName = (raw.lastName || raw['Last Name'] || raw['last_name'] || '').trim();

    if (!firstName) {
      const combinedName = (
        raw.name ||
        raw['Name'] ||
        raw['Full Name'] ||
        raw['full_name'] ||
        raw['Candidate Name'] ||
        raw['candidateName'] ||
        ''
      ).trim();

      if (combinedName) {
        const parts = combinedName.split(/\s+/);
        firstName = parts[0];
        lastName = parts.slice(1).join(' ');
      } else {
        firstName = email.split('@')[0].replace(/[._-]/g, ' ');
      }
    }

    // 3. Normalize Phone
    const phone = (
      raw.phone ||
      raw['Phone'] ||
      raw['Phone number'] ||
      raw['Phone Number'] ||
      raw['phone number'] ||
      raw['phoneNumber'] ||
      raw['Mobile'] ||
      raw['Mobile Number'] ||
      raw['Contact'] ||
      raw['Contact Number'] ||
      ''
    ).toString().trim() || undefined;

    // 4. Normalize Resume URL
    const resumeUrl = (
      raw.resumeUrl ||
      raw['Submit your cover letter or resume (pdf/word)'] ||
      raw['Submit your cover letter or resume'] ||
      raw['Submit your resume (pdf/word)'] ||
      raw['Submit your resume'] ||
      raw['Resume'] ||
      raw['resume'] ||
      raw['CV'] ||
      raw['cv'] ||
      raw['File'] ||
      raw['Resume Link'] ||
      raw['resumeLink'] ||
      raw['Google Drive Link'] ||
      ''
    ).toString().trim() || undefined;

    // 5. Extract desired position(s) specified in incoming form data
    const candidatePositionPhrases: string[] = [];
    const rawPositions = [
      raw.position,
      raw['Which position(s) are you interested in?'],
      raw['Which position are you interested in?'],
      raw['Which position(s) are you interested in'],
      raw['Which position are you interested in'],
      raw['Role'],
      raw['role'],
      raw.jobTitle,
      raw['jobTitle'],
      raw['Position'],
    ].filter(Boolean);

    for (const pItem of rawPositions) {
      if (Array.isArray(pItem)) {
        candidatePositionPhrases.push(...pItem.map(String));
      } else if (typeof pItem === 'string') {
        const parts = pItem.split(/[,;/|\n]+/).map((p: string) => p.trim()).filter(Boolean);
        candidatePositionPhrases.push(...parts);
      }
    }

    const coverLetter = (
      raw.coverLetter ||
      raw['Cover Letter'] ||
      raw['cover_letter'] ||
      raw['Why should we hire you?'] ||
      raw['Note'] ||
      ''
    ).toString().trim() || undefined;

    if (coverLetter) {
      // Check patterns like "Interested Position from Form: Content Creator, Business Executive"
      const match = coverLetter.match(
        /(?:interested position(?: from form)?|position applied(?: for)?|target role|role|position)\s*[:\-]\s*([^\n\r]+)/i,
      );
      if (match && match[1]) {
        const parts = match[1]
          .split(/[,;/|]+/)
          .map((p: string) => p.trim())
          .filter(Boolean);
        candidatePositionPhrases.push(...parts);
      }
    }

    // Match candidate position phrases against open jobs in this org
    const matchedJobs: typeof org.jobs = [];

    const matchJob = (phrase: string) => {
      const p = phrase.toLowerCase().trim();
      if (!p) return null;

      // 0. Acronym / Synonym normalization
      const normalizedP = p === 'hr' || p === 'hr executive' || p === 'human resource' ? 'human resources'
        : p === 'bde' || p === 'sales' ? 'business development'
        : p;

      // 1. Exact match
      let j = org.jobs.find((x) => x.title.toLowerCase().trim() === normalizedP || x.title.toLowerCase().trim() === p);
      if (j) return j;

      // 2. Substring / contains
      j = org.jobs.find(
        (x) =>
          x.title.toLowerCase().includes(normalizedP) ||
          normalizedP.includes(x.title.toLowerCase()) ||
          x.title.toLowerCase().includes(p) ||
          p.includes(x.title.toLowerCase()),
      );
      if (j) return j;

      // 3. Word overlap (e.g. "Business Executive" matches "Business Development Executive", "SEO" matches "SEO Executive")
      const pWords = normalizedP
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length >= 2);
      let bestMatch: any = null;
      let maxOverlap = 0;
      for (const candidateJob of org.jobs) {
        const jobWords = candidateJob.title
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((w) => w.length >= 2);
        const overlap = pWords.filter((w) => jobWords.includes(w)).length;
        if (overlap > maxOverlap && overlap >= 1) {
          maxOverlap = overlap;
          bestMatch = candidateJob;
        }
      }
      return bestMatch;
    };

    for (const phrase of candidatePositionPhrases) {
      const found = matchJob(phrase);
      if (found && !matchedJobs.some((x) => x.id === found.id)) {
        matchedJobs.push(found);
      }
    }

    // Also scan coverLetter directly if no phrases matched yet
    if (matchedJobs.length === 0 && coverLetter) {
      for (const openJob of org.jobs) {
        if (coverLetter.toLowerCase().includes(openJob.title.toLowerCase())) {
          matchedJobs.push(openJob);
        }
      }
    }

    // If explicit raw.jobId passed
    if (matchedJobs.length === 0 && raw.jobId) {
      const explicitJob = org.jobs.find((x) => x.id === raw.jobId);
      if (explicitJob) matchedJobs.push(explicitJob);
    }

    // Fallback: If still nothing matched, and URL route jobId was passed and valid:
    if (matchedJobs.length === 0 && jobId) {
      const urlJob = org.jobs.find((x) => x.id === jobId);
      if (urlJob) matchedJobs.push(urlJob);
    }

    // Ultimate fallback: First open job if nothing matched
    if (matchedJobs.length === 0) {
      matchedJobs.push(org.jobs[0]);
    }

    const effectiveSource = (raw.source || raw.utmSource || 'GOOGLE_FORM')
      .toUpperCase()
      .trim();

    // Extract skills if specified in form fields or infer from matched jobs
    let initialSkills: string[] = [];
    const rawSkillsField =
      raw.skills ||
      raw['Skills'] ||
      raw['Key Skills'] ||
      raw['Skills & Technologies'] ||
      raw['Technical Skills'] ||
      raw['Core Competencies'] ||
      raw['Expertise'];

    if (Array.isArray(rawSkillsField)) {
      initialSkills = rawSkillsField.map(String).map((s) => s.trim()).filter(Boolean);
    } else if (typeof rawSkillsField === 'string') {
      initialSkills = rawSkillsField.split(/[,;\n\r|•]+/).map((s) => s.trim()).filter(Boolean);
    }

    // Skills must come strictly from the candidate resume or form response, never invented from job titles.

    // 1. Find or create candidate record
    const candidate = await this.candidatesService.findOrCreate(org.id, {
      firstName,
      lastName,
      email,
      phone,
      currentCompany: raw.currentCompany,
      currentTitle: raw.currentTitle || raw.position || matchedJobs[0]?.title || 'Applicant',
      location: raw.location,
      linkedinUrl: raw.linkedinUrl,
      portfolioUrl: raw.portfolioUrl,
      githubUrl: raw.githubUrl,
      skills: initialSkills,
      source: effectiveSource,
      resumeUrl,
    });

    // 2. Submit applications for all matched jobs (placing in first stage by default)
    const applications = [];
    for (const targetJob of matchedJobs) {
      try {
        const app = await this.applicationsService.create(org.id, {
          jobId: targetJob.id,
          candidateId: candidate.id,
          coverLetter: dto.coverLetter || coverLetter,
          source: effectiveSource,
          utmSource: dto.utmSource,
          utmMedium: dto.utmMedium,
          utmCampaign: dto.utmCampaign,
          metadata: {
            ...(resumeUrl ? { resumeUrl } : {}),
            appliedVia: effectiveSource,
            sourceChannel: effectiveSource,
            ingestedVia: 'WEBHOOK_API',
          },
        });
        applications.push(app);
      } catch (appErr: any) {
        // Skip conflict if application already exists for this job
      }
    }

    const primaryJob = matchedJobs[0];
    return {
      message: `Candidate ingested successfully into ${matchedJobs.map((j) => j.title).join(', ')}`,
      applicationId: applications[0]?.id || null,
      candidateId: candidate.id,
      jobTitle: matchedJobs.map((j) => j.title).join(', '),
      source: effectiveSource,
      matchedJobs: matchedJobs.map((j) => ({ id: j.id, title: j.title })),
    };
  }
}
