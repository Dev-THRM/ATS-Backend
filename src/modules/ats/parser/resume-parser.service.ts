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
  // Tech & Engineering
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Golang', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'SQL',
  'React', 'React.js', 'Next.js', 'Vue', 'Angular', 'Node.js', 'NestJS', 'Express', 'Express.js', 'Django', 'FastAPI', 'Spring Boot', 'Laravel',
  'PostgreSQL', 'Postgres', 'MySQL', 'MongoDB', 'Redis', 'DynamoDB', 'Elasticsearch', 'SQLite',
  'AWS', 'Amazon Web Services', 'Azure', 'GCP', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'GitHub Actions', 'Linux',
  'REST', 'RESTful API', 'GraphQL', 'Microservices', 'Git', 'Agile', 'Scrum', 'TDD', 'System Design', 'Tailwind', 'TailwindCSS',
  'HTML', 'CSS', 'Redux', 'Zustand', 'Prisma', 'TypeORM', 'RabbitMQ', 'Kafka', 'BullMQ',

  // Sales & Business Development
  'Business Development', 'Sales Outreach', 'Cold Outreach', 'Lead Generation', 'Lead Conversion', 'Client Communication',
  'Client Servicing', 'Proposal Drafting', 'Negotiation', 'B2B Sales', 'B2C Sales', 'Account Management',
  'CRM', 'Salesforce', 'HubSpot', 'Pipeline Management', 'Customer Relationship Management', 'Market Research',
  'Relationship Building', 'Presentations', 'Pitching', 'Deal Closing',

  // Digital Marketing, SEO & Social Media
  'Digital Marketing', 'Social Media Marketing', 'Social Media Management', 'Content Creation', 'Content Strategy',
  'Copywriting', 'SEO', 'Search Engine Optimization', 'SEM', 'Search Engine Marketing', 'Google Ads', 'Meta Ads',
  'Facebook Ads', 'Instagram Marketing', 'Performance Marketing', 'Email Marketing', 'Brand Strategy', 'Brand Outreach',
  'Influencer Marketing', 'Public Relations', 'Canva', 'Copyediting', 'Content Writing', 'Reels', 'Shorts',

  // Creative, Design & Video Editing
  'Video Editing', 'Adobe Premiere Pro', 'Premiere Pro', 'After Effects', 'Final Cut Pro', 'DaVinci Resolve',
  'Photoshop', 'Illustrator', 'Graphic Design', 'Motion Graphics', 'Storyboarding', 'Sound Design', 'Color Grading',
  'Videography', 'Photography',

  // Analytics & Productivity Tools
  'MS Office', 'Excel', 'Google Analytics', 'Google Search Console', 'Ahrefs', 'Semrush', 'Notion', 'Figma', 'Slack',
];

const CASE_SENSITIVE_SKILLS = new Set([
  'Go',
  'Rust',
  'Ruby',
  'Git',
  'REST',
  'C',
  'C++',
  'C#',
  'R',
  'PHP',
  'SQL',
]);

@Injectable()
export class ResumeParserService {
  private readonly logger = new Logger(ResumeParserService.name);

  /**
   * Extracts raw text from a PDF Buffer or plain text buffer.
   * Seamlessly handles both pdf-parse v1 (function) and v2 (PDFParse class).
   */
  async extractTextFromBuffer(buffer: Buffer, mimeType?: string): Promise<string> {
    try {
      if (mimeType?.includes('pdf') || buffer.slice(0, 5).toString().includes('%PDF')) {
        let text = '';
        if (typeof pdfParse === 'function') {
          const data = await (pdfParse as any)(buffer);
          text = data?.text || '';
        } else if (pdfParse?.PDFParse) {
          const u8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
          const parser = new pdfParse.PDFParse(u8);
          const res = await parser.getText();
          text = typeof res === 'string' ? res : res?.text || '';
        } else if (typeof (pdfParse as any)?.default === 'function') {
          const data = await (pdfParse as any).default(buffer);
          text = data?.text || '';
        }
        return text || '';
      }

      // Detect if buffer is an HTML webpage (e.g. Google Drive sign-in or error page)
      const sample = buffer.slice(0, 500).toString('utf-8').toLowerCase();
      const isHtml =
        mimeType?.includes('text/html') ||
        sample.includes('<!doctype html') ||
        sample.includes('<html') ||
        sample.includes('<head') ||
        sample.includes('accounts.google.com') ||
        sample.includes('drive.google.com') ||
        sample.includes('<body');

      if (isHtml) {
        this.logger.warn('Supplied buffer is an HTML document or web page, not a resume file. Discarding text.');
        return '';
      }

      return buffer.toString('utf-8');
    } catch (err: any) {
      this.logger.warn(`Failed to parse PDF stream directly: ${err.message}.`);
      return '';
    }
  }

  /**
   * Parses structured resume details from raw text.
   */
  parseResumeText(rawText: string): ParsedResumeData {
    if (!rawText || rawText.trim().length === 0) {
      return {
        rawText: '',
        candidateInfo: {},
        skills: [],
        experienceYears: 0,
        education: [],
      };
    }

    // Discard any raw HTML text (e.g. if an HTML page was passed)
    const trimmedLower = rawText.trim().toLowerCase();
    if (
      trimmedLower.startsWith('<!doctype') ||
      trimmedLower.startsWith('<html') ||
      trimmedLower.includes('accounts.google.com') ||
      (trimmedLower.includes('<head') && trimmedLower.includes('<body'))
    ) {
      this.logger.warn('HTML document detected in parseResumeText. Aborting parsing.');
      return {
        rawText: '',
        candidateInfo: {},
        skills: [],
        experienceYears: 0,
        education: [],
      };
    }

    // Clean stray HTML tags/scripts if any exist
    const text = rawText
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');

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
    const skills = new Set<string>();

    // 1. Check against dictionary using strict word boundaries to avoid substring false positives
    for (const skill of COMMON_SKILLS_DICTIONARY) {
      const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const isCaseSensitive = CASE_SENSITIVE_SKILLS.has(skill);
      const regex = new RegExp(`\\b${escaped}\\b`, isCaseSensitive ? '' : 'i');
      if (regex.test(text)) {
        skills.add(skill);
      }
    }

    // 2. Heuristic extraction from explicit "SKILLS" section in resume
    const skillsSectionMatch = text.match(/(?:SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS)[:\n\r]+([^\n\r]+(?:\n[^\n\r]+){0,3})/i);
    if (skillsSectionMatch && skillsSectionMatch[1]) {
      const extractedRaw = skillsSectionMatch[1]
        .split(/[,•|·\n\r]/)
        .map((s) => s.trim().replace(/^[-*•]\s*/, ''))
        .filter((s) => s.length > 2 && s.length < 40 && !/^(and|or|with|the)$/i.test(s));

      for (const item of extractedRaw) {
        if (!skills.has(item)) {
          skills.add(item);
        }
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
    if (/bachelor|b\.s\.|b\.tech|b\.e\.|b\.com/i.test(text)) education.push("Bachelor's Degree");
    if (/master|m\.s\.|m\.tech|m\.b\.a\.|pgpm|pgdm/i.test(text)) education.push("Master's / Postgraduate Degree");
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
   * Works accurately across all domains (Sales, Marketing, Content, Video Editing, Software).
   */
  calculateAtsScore(
    parsedResume: ParsedResumeData,
    job: {
      title: string;
      description: string;
      department?: string | null;
      experienceMin?: number | null;
      experienceMax?: number | null;
      experienceLevel?: string | null;
    },
  ): AtsScoreResult {
    const jobText = `${job.title} ${job.description} ${job.department || ''}`;
    const resumeTextLower = parsedResume.rawText.toLowerCase();

    // Identify target job skills with exact word boundaries (never substring!)
    const jobRequiredSkills: string[] = [];
    for (const skill of COMMON_SKILLS_DICTIONARY) {
      const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const isCaseSensitive = CASE_SENSITIVE_SKILLS.has(skill);
      const regex = new RegExp(`\\b${escaped}\\b`, isCaseSensitive ? '' : 'i');
      if (regex.test(jobText)) {
        jobRequiredSkills.push(skill);
      }
    }

    const candidateSkillsLower = parsedResume.skills.map((s) => s.toLowerCase());
    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const reqSkill of jobRequiredSkills) {
      const reqLower = reqSkill.toLowerCase();
      // Check both extracted skills and raw resume text
      if (candidateSkillsLower.includes(reqLower) || resumeTextLower.includes(reqLower)) {
        matchedSkills.push(reqSkill);
      } else {
        missingSkills.push(reqSkill);
      }
    }

    // 1. Skills match score (45% weight)
    let skillsScore = 65;
    if (jobRequiredSkills.length > 0) {
      skillsScore = Math.round((matchedSkills.length / jobRequiredSkills.length) * 100);
      // Give partial credit if candidate has strong general skills
      if (matchedSkills.length === 0 && parsedResume.skills.length >= 3) {
        skillsScore = Math.min(60, parsedResume.skills.length * 15);
      }
    } else {
      skillsScore = Math.min(95, Math.max(60, parsedResume.skills.length * 15));
    }

    // 2. Title and domain keyword relevance (35% weight)
    let relevanceScore = 70;
    const titleWords = job.title
      .toLowerCase()
      .split(/[\s/,-]+/)
      .filter((w) => w.length > 2 && !/^(and|for|the|with)$/.test(w));

    if (titleWords.length > 0) {
      let matchedTitleWords = 0;
      for (const word of titleWords) {
        if (resumeTextLower.includes(word)) {
          matchedTitleWords++;
        }
      }
      relevanceScore = Math.round((matchedTitleWords / titleWords.length) * 100);
      // Floor at 50 if candidate has general field keywords
      if (relevanceScore < 50 && (resumeTextLower.includes('sales') || resumeTextLower.includes('marketing') || resumeTextLower.includes('development') || resumeTextLower.includes('content') || resumeTextLower.includes('creator') || resumeTextLower.includes('engineer'))) {
        relevanceScore = 65;
      }
    }

    // 3. Experience alignment (20% weight)
    let experienceScore = 80;
    const isEntryLevel =
      job.experienceLevel === 'ENTRY' ||
      job.experienceLevel === 'INTERNSHIP' ||
      job.experienceMin === null ||
      job.experienceMin === undefined ||
      job.experienceMin === 0;

    if (isEntryLevel) {
      // Entry-level or internship roles welcome freshers and students
      experienceScore = 90;
    } else if (job.experienceMin !== null && job.experienceMin !== undefined) {
      if (parsedResume.experienceYears >= job.experienceMin) {
        experienceScore = 100;
      } else if (parsedResume.experienceYears > 0) {
        experienceScore = Math.round((parsedResume.experienceYears / job.experienceMin) * 80);
      } else {
        experienceScore = 55;
      }
    }

    // Aggregate weighted score: 45% skills + 35% relevance + 20% experience
    const finalScore = Math.min(
      100,
      Math.max(
        10,
        Math.round(skillsScore * 0.45 + relevanceScore * 0.35 + experienceScore * 0.20),
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
