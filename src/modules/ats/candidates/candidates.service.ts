import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { ResumeParserService } from '../parser/resume-parser.service.js';
import { CreateCandidateDto } from './dto/create-candidate.dto.js';
import { UpdateCandidateDto } from './dto/update-candidate.dto.js';
import { QueryCandidatesDto } from './dto/query-candidates.dto.js';
import { BulkImportCsvDto } from './dto/bulk-import.dto.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class CandidatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(StorageService) private readonly storageService?: StorageService,
    @Optional() @Inject(ResumeParserService) private readonly resumeParser?: ResumeParserService,
  ) {}

  /**
   * Creates a new candidate or returns existing candidate if email exists for organization.
   */
  async create(organizationId: string, dto: CreateCandidateDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.candidate.findUnique({
      where: {
        email_organizationId: {
          email,
          organizationId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Candidate with email '${email}' already exists in your organization`,
      );
    }

    return this.prisma.candidate.create({
      data: {
        ...dto,
        email,
        organizationId,
      },
    });
  }

  /**
   * Finds or creates a candidate during quick application submission.
   */
  async findOrCreate(
    organizationId: string,
    dto: CreateCandidateDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const email = dto.email.toLowerCase().trim();

    let candidate = await client.candidate.findUnique({
      where: {
        email_organizationId: {
          email,
          organizationId,
        },
      },
    });

    if (!candidate) {
      candidate = await client.candidate.create({
        data: {
          ...dto,
          email,
          organizationId,
        },
      });
    } else {
      candidate = await client.candidate.update({
        where: { id: candidate.id },
        data: {
          firstName: dto.firstName || candidate.firstName,
          lastName: dto.lastName !== undefined ? dto.lastName : candidate.lastName,
          ...(dto.phone ? { phone: dto.phone } : {}),
          ...(dto.currentCompany ? { currentCompany: dto.currentCompany } : {}),
          ...(dto.currentTitle ? { currentTitle: dto.currentTitle } : {}),
          ...(dto.location ? { location: dto.location } : {}),
          ...(dto.linkedinUrl ? { linkedinUrl: dto.linkedinUrl } : {}),
          ...(dto.portfolioUrl ? { portfolioUrl: dto.portfolioUrl } : {}),
          ...(dto.githubUrl ? { githubUrl: dto.githubUrl } : {}),
          ...(dto.resumeUrl ? { resumeUrl: dto.resumeUrl } : {}),
          ...(dto.skills && dto.skills.length > 0 ? { skills: dto.skills } : {}),
        },
      });
    }

    return candidate;
  }

  /**
   * Lists candidates with search, skill filtering, and pagination.
   */
  async findAll(organizationId: string, query: QueryCandidatesDto = {}) {
    const {
      search,
      skill,
      source,
      tag,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.CandidateWhereInput = {
      organizationId,
      ...(source && { source }),
      ...(skill && { skills: { has: skill } }),
      ...(tag && { tags: { has: tag } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { currentCompany: { contains: search, mode: 'insensitive' } },
          { currentTitle: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.max(1, Number(limit) || 10);
    const skip = (pageNum - 1) * limitNum;

    const [total, candidates] = await Promise.all([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
    ]);

    return {
      data: candidates,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  /**
   * Finds a specific candidate with all past applications, jobs, and stage details.
   */
  async findOne(organizationId: string, candidateId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: {
        id: candidateId,
        organizationId,
      },
      include: {
        applications: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                department: true,
                status: true,
                employmentType: true,
              },
            },
            currentStage: {
              select: {
                id: true,
                name: true,
                order: true,
              },
            },
          },
          orderBy: { appliedAt: 'desc' },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with ID '${candidateId}' not found`);
    }

    return candidate;
  }

  /**
   * Updates an existing candidate profile.
   */
  async update(
    organizationId: string,
    candidateId: string,
    dto: UpdateCandidateDto,
  ) {
    await this.findOne(organizationId, candidateId);

    const email = dto.email ? dto.email.toLowerCase().trim() : undefined;

    if (email) {
      const existing = await this.prisma.candidate.findUnique({
        where: {
          email_organizationId: {
            email,
            organizationId,
          },
        },
      });

      if (existing && existing.id !== candidateId) {
        throw new ConflictException(
          `Candidate with email '${email}' already exists in your organization`,
        );
      }
    }

    return this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        ...dto,
        ...(email && { email }),
      },
    });
  }

  /**
   * Deletes a candidate and their associated applications.
   */
  async remove(organizationId: string, candidateId: string) {
    await this.findOne(organizationId, candidateId);

    await this.prisma.candidate.delete({
      where: { id: candidateId },
    });

    return {
      message: 'Candidate profile deleted successfully',
      id: candidateId,
    };
  }

  /**
   * Bulk imports candidates from parsed CSV rows.
   */
  async bulkImportCsv(organizationId: string, dto: BulkImportCsvDto) {
    let jobFirstStageId: string | undefined = undefined;
    if (dto.jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: dto.jobId, organizationId },
        include: { pipelineStages: { orderBy: { order: 'asc' }, take: 1 } },
      });
      if (job && job.pipelineStages.length > 0) {
        jobFirstStageId = job.pipelineStages[0].id;
      }
    }

    let createdCount = 0;
    let updatedCount = 0;
    let appsCreatedCount = 0;
    const errors: Array<{ email: string; reason: string }> = [];
    const processedCandidates: any[] = [];

    for (const item of dto.candidates) {
      try {
        if (!item.email || !item.firstName) {
          errors.push({ email: item.email || 'unknown', reason: 'First name and email are required' });
          continue;
        }

        const email = item.email.toLowerCase().trim();
        const source = item.source || dto.defaultSource || 'CSV_IMPORT';
        
        let skills: string[] = [];
        if (Array.isArray(item.skills)) {
          skills = item.skills.map((s) => s.trim()).filter(Boolean);
        } else if (typeof item.skills === 'string') {
          skills = (item.skills as string)
            .split(/[,;|]/)
            .map((s) => s.trim())
            .filter(Boolean);
        }

        const existing = await this.prisma.candidate.findUnique({
          where: {
            email_organizationId: {
              email,
              organizationId,
            },
          },
        });

        let candidate;
        if (existing) {
          const mergedSkills = Array.from(new Set([...existing.skills, ...skills]));
          const mergedTags = Array.from(
            new Set([...existing.tags, ...(item.tags || []), ...(dto.tags || [])]),
          );

          candidate = await this.prisma.candidate.update({
            where: { id: existing.id },
            data: {
              firstName: item.firstName || existing.firstName,
              lastName: item.lastName !== undefined ? item.lastName : existing.lastName,
              ...(item.phone ? { phone: item.phone } : {}),
              ...(item.currentCompany ? { currentCompany: item.currentCompany } : {}),
              ...(item.currentTitle ? { currentTitle: item.currentTitle } : {}),
              ...(item.location ? { location: item.location } : {}),
              ...(item.linkedinUrl ? { linkedinUrl: item.linkedinUrl } : {}),
              skills: mergedSkills,
              tags: mergedTags,
            },
          });
          updatedCount++;
        } else {
          candidate = await this.prisma.candidate.create({
            data: {
              organizationId,
              email,
              firstName: item.firstName.trim(),
              lastName: item.lastName?.trim() || '',
              phone: item.phone || null,
              currentCompany: item.currentCompany || null,
              currentTitle: item.currentTitle || null,
              location: item.location || null,
              source,
              linkedinUrl: item.linkedinUrl || null,
              skills,
              tags: [...(item.tags || []), ...(dto.tags || [])],
            },
          });
          createdCount++;
        }

        processedCandidates.push(candidate);

        // If a target job was selected, link candidate to the job application
        if (dto.jobId && jobFirstStageId) {
          const existingApp = await this.prisma.application.findUnique({
            where: {
              candidateId_jobId: {
                candidateId: candidate.id,
                jobId: dto.jobId,
              },
            },
          });

          if (!existingApp) {
            await this.prisma.application.create({
              data: {
                organizationId,
                jobId: dto.jobId,
                candidateId: candidate.id,
                currentStageId: jobFirstStageId,
                status: 'ACTIVE',
                source,
                utmSource: 'bulk_csv_import',
              },
            });
            appsCreatedCount++;
          }
        }
      } catch (err: any) {
        errors.push({ email: item.email, reason: err.message });
      }
    }

    return {
      message: `Successfully processed ${dto.candidates.length} candidates`,
      total: dto.candidates.length,
      created: createdCount,
      updated: updatedCount,
      applicationsCreated: appsCreatedCount,
      errors,
      candidates: processedCandidates,
    };
  }

  /**
   * Bulk imports and automatically parses a batch of resume files.
   */
  async bulkImportResumes(
    organizationId: string,
    files: Express.Multer.File[],
    defaultSource: string = 'RESUME_BATCH',
    jobId?: string,
  ) {
    let jobFirstStageId: string | undefined = undefined;
    if (jobId) {
      const job = await this.prisma.job.findFirst({
        where: { id: jobId, organizationId },
        include: { pipelineStages: { orderBy: { order: 'asc' }, take: 1 } },
      });
      if (job && job.pipelineStages.length > 0) {
        jobFirstStageId = job.pipelineStages[0].id;
      }
    }

    const results: any[] = [];
    const errors: any[] = [];

    for (const file of files) {
      try {
        const fileKey = `resumes/${organizationId}/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        let resumeUrl = '';

        if (this.storageService) {
          const uploadRes = await this.storageService.uploadBuffer({
            key: fileKey,
            buffer: file.buffer,
            contentType: file.mimetype,
          });
          resumeUrl = uploadRes.url;
        }

        let rawText = '';
        if (this.resumeParser) {
          rawText = await this.resumeParser.extractTextFromBuffer(file.buffer, file.mimetype);
        } else {
          rawText = file.buffer.toString('utf-8');
        }

        const parsed = this.resumeParser
          ? this.resumeParser.parseResumeText(rawText)
          : {
              rawText,
              candidateInfo: {} as {
                firstName?: string;
                lastName?: string;
                email?: string;
                phone?: string;
                location?: string;
                linkedinUrl?: string;
                githubUrl?: string;
              },
              skills: [] as string[],
              experienceYears: 0,
              education: [] as string[],
            };

        const candidateInfo = parsed.candidateInfo || {};
        const fallbackName = file.originalname.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
        const firstName = candidateInfo.firstName || fallbackName.split(' ')[0] || 'Imported';
        const lastName = candidateInfo.lastName || fallbackName.split(' ').slice(1).join(' ') || 'Candidate';
        const email = (
          candidateInfo.email ||
          `candidate.${randomUUID().slice(0, 8)}@legacy-import.local`
        ).toLowerCase().trim();

        const candidate = await this.findOrCreate(organizationId, {
          firstName,
          lastName,
          email,
          phone: candidateInfo.phone,
          location: candidateInfo.location,
          linkedinUrl: candidateInfo.linkedinUrl,
          githubUrl: candidateInfo.githubUrl,
          resumeUrl: resumeUrl || undefined,
          skills: parsed.skills,
          source: defaultSource,
        });

        if (jobId && jobFirstStageId) {
          const existingApp = await this.prisma.application.findUnique({
            where: {
              candidateId_jobId: {
                candidateId: candidate.id,
                jobId,
              },
            },
          });

          if (!existingApp) {
            await this.prisma.application.create({
              data: {
                organizationId,
                jobId,
                candidateId: candidate.id,
                currentStageId: jobFirstStageId,
                status: 'ACTIVE',
                source: defaultSource,
                utmSource: 'resume_batch_import',
              },
            });
          }
        }

        results.push({
          fileName: file.originalname,
          candidateId: candidate.id,
          name: `${candidate.firstName} ${candidate.lastName}`.trim(),
          email: candidate.email,
          skills: candidate.skills,
          resumeUrl,
        });
      } catch (err: any) {
        errors.push({ fileName: file.originalname, error: err.message });
      }
    }

    return {
      message: `Batch processed ${files.length} resume files`,
      total: files.length,
      successful: results.length,
      failed: errors.length,
      imported: results,
      errors,
    };
  }

  /**
   * Generates sample CSV template for candidate bulk import.
   */
  getCsvTemplate(): string {
    return `First Name,Last Name,Email,Phone,Current Company,Current Title,Location,Skills,Source,LinkedIn URL
John,Doe,john.doe@example.com,+1234567890,Acme Corp,Senior Software Engineer,New York,"TypeScript, React, Node.js, PostgreSQL",NAUKRI,https://linkedin.com/in/johndoe
Jane,Smith,jane.smith@example.com,+919876543210,Google,Staff Engineer,Bengaluru,"Python, Kubernetes, Distributed Systems, Go",LINKEDIN,https://linkedin.com/in/janesmith
Alex,Rivera,alex.rivera@example.com,+447911123456,Fintech UK,Backend Developer,London,"Java, Spring Boot, AWS, Docker",GLASSDOOR,https://linkedin.com/in/alexrivera
Priya,Sharma,priya.sharma@example.com,+919123456780,Tech Mahindra,Frontend Specialist,Hyderabad,"React, Next.js, Redux, Tailwind",UNSTOP,https://linkedin.com/in/priyasharma`;
  }
}
