import { Injectable, Logger } from '@nestjs/common';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface ParsedResumeData {
  rawText: string;
  candidateInfo: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedinUrl?: string;
    githubUrl?: string;
  };
  skills: string[];
  experienceYears: number;
  education: string[];
}

export interface AtsScoreResult {
  score: number; // 0 to 100
  matchedSkills: string[];
  missingSkills: string[];
  experienceMatchScore: number;
  titleRelevanceScore: number;
  breakdown: {
    skillsScore: number;
    experienceScore: number;
    relevanceScore: number;
  };
}

const COMMON_SKILLS_DICTIONARY = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Golang', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'SQL',
  'React', 'React.js', 'Next.js', 'Vue', 'Angular', 'Node.js', 'NestJS', 'Express', 'Express.js', 'Django', 'FastAPI', 'Spring Boot', 'Laravel',
  'PostgreSQL', 'Postgres', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Elasticsearch', 'SQLite',
  'AWS', 'Amazon Web Services', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'GitHub Actions', 'Linux',
  'REST', 'RESTful API', 'GraphQL', 'Microservices', 'Git', 'Agile', 'Scrum', 'TDD', 'System Design', 'Tailwind', 'TailwindCSS',
  'HTML', 'CSS', 'Redux', 'Zustand', 'Prisma', 'TypeORM', 'RabbitMQ', 'Kafka', 'BullMQ',
];

@Injectable()
export class ResumeParserService {
  private readonly logger = new Logger(ResumeParserService.name);

  /**
   * Extracts raw text from a PDF Buffer or plain text buffer.
   */
  async extractTextFromBuffer(buffer: Buffer, mimeType?: string): Promise<string> {
    try {
      if (mimeType?.includes('pdf') || buffer.slice(0, 5).toString().includes('%PDF')) {
        const data = await (pdfParse as any)(buffer);
        return data.text || '';
      }
      return buffer.toString('utf-8');
    } catch (err: any) {
      this.logger.warn(`Failed to parse PDF stream directly: ${err.message}. Falling back to utf-8 text.`);
      return buffer.toString('utf-8');
    }
  }

  /**
   * Parses structured resume details from raw text.
   */
  parseResumeText(rawText: string): ParsedResumeData {
    const text = rawText || '';

    // Extract email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0].toLowerCase() : undefined;

    // Extract phone
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : undefined;

    // Extract links
    const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+/i);
    const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_-]+/i);

    // Extract Skills
    const lowerText = text.toLowerCase();
    const skills = new Set<string>();

    for (const skill of COMMON_SKILLS_DICTIONARY) {
      const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      // Use word boundary to avoid matching "go" in "going" or "java" in "javascript"
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(text)) {
        skills.add(skill);
      }
    }

    // Extract years of experience heuristic
    let experienceYears = 0;
    const expRegex = /(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/gi;
    let match;
    while ((match = expRegex.exec(text)) !== null) {
      const yrs = parseInt(match[1], 10);
      if (yrs > experienceYears && yrs < 40) {
        experienceYears = yrs;
      }
    }

    // Extract education keywords
    const education: string[] = [];
    if (/bachelor|b\.s\.|b\.tech|b\.e\./i.test(text)) education.push("Bachelor's Degree");
    if (/master|m\.s\.|m\.tech|m\.b\.a\./i.test(text)) education.push("Master's Degree");
    if (/ph\.?d|doctorate/i.test(text)) education.push('Doctorate / Ph.D.');

    return {
      rawText,
      candidateInfo: {
        email,
        phone,
        linkedinUrl: linkedinMatch ? linkedinMatch[0] : undefined,
        githubUrl: githubMatch ? githubMatch[0] : undefined,
      },
      skills: Array.from(skills),
      experienceYears,
      education,
    };
  }

  /**
   * Computes an ATS score (0 to 100) by matching resume against Job requirements.
   */
  calculateAtsScore(
    parsedResume: ParsedResumeData,
    job: {
      title: string;
      description: string;
      department?: string | null;
      experienceMin?: number | null;
      experienceMax?: number | null;
    },
  ): AtsScoreResult {
    const jobText = `${job.title} ${job.description} ${job.department || ''}`.toLowerCase();

    // Identify target job skills
    const jobRequiredSkills: string[] = [];
    for (const skill of COMMON_SKILLS_DICTIONARY) {
      if (jobText.includes(skill.toLowerCase())) {
        jobRequiredSkills.push(skill);
      }
    }

    const candidateSkillsLower = parsedResume.skills.map((s) => s.toLowerCase());
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const reqSkill of jobRequiredSkills) {
      if (candidateSkillsLower.includes(reqSkill.toLowerCase())) {
        matchedSkills.push(reqSkill);
      } else {
        missingSkills.push(reqSkill);
      }
    }

    // 1. Skills match score (50% weight)
    let skillsScore = 50;
    if (jobRequiredSkills.length > 0) {
      skillsScore = Math.round((matchedSkills.length / jobRequiredSkills.length) * 100);
    } else {
      skillsScore = Math.min(100, parsedResume.skills.length * 10);
    }

    // 2. Title and domain keyword relevance (30% weight)
    let relevanceScore = 0;
    const titleWords = job.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    let matchedTitleWords = 0;
    for (const word of titleWords) {
      if (parsedResume.rawText.toLowerCase().includes(word)) {
        matchedTitleWords++;
      }
    }
    relevanceScore = titleWords.length > 0 ? Math.round((matchedTitleWords / titleWords.length) * 100) : 70;

    // 3. Experience alignment (20% weight)
    let experienceScore = 70;
    if (job.experienceMin !== null && job.experienceMin !== undefined) {
      if (parsedResume.experienceYears >= job.experienceMin) {
        experienceScore = 100;
      } else if (parsedResume.experienceYears > 0) {
        experienceScore = Math.round((parsedResume.experienceYears / job.experienceMin) * 75);
      } else {
        experienceScore = 50;
      }
    }

    // Aggregate weighted score
    const finalScore = Math.min(
      100,
      Math.max(
        0,
        Math.round(skillsScore * 0.5 + relevanceScore * 0.3 + experienceScore * 0.2),
      ),
    );

    return {
      score: finalScore,
      matchedSkills,
      missingSkills,
      experienceMatchScore: experienceScore,
      titleRelevanceScore: relevanceScore,
      breakdown: {
        skillsScore,
        experienceScore,
        relevanceScore,
      },
    };
  }
}
