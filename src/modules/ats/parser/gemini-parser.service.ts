import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiAnalysisResult {
  isAiGenerated: boolean;
  aiConfidence: number; // 0 to 100
  aiDetectionReason?: string;
  flaggedSections: string[];
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
  atsScore: number; // 0 to 100
  matchedSkills: string[];
  missingSkills: string[];
  scoreBreakdown: {
    skillsScore: number;
    experienceScore: number;
    relevanceScore: number;
  };
}

@Injectable()
export class GeminiParserService {
  private readonly logger = new Logger(GeminiParserService.name);
  private readonly genAI?: GoogleGenerativeAI;
  private readonly isEnabled: boolean = false;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    const apiKey = process.env.GEMINI_API_KEY || this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.isEnabled = true;
      this.logger.log('Google Gemini Flash AI parser initialized successfully.');
    } else {
      this.logger.log('GEMINI_API_KEY not provided. Operating in deterministic local parsing mode.');
    }
  }

  isAiActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Analyzes resume text or document using Google Gemini Flash model for AI-content forensics,
   * candidate information extraction, and ATS match scoring.
   */
  async analyzeResumeWithGemini(
    resumeText: string,
    job: {
      title: string;
      description: string;
      department?: string | null;
      experienceMin?: number | null;
      experienceMax?: number | null;
    },
  ): Promise<GeminiAnalysisResult | null> {
    if (!this.isEnabled || !this.genAI) {
      return null;
    }

    const candidateModels = [
      process.env.GEMINI_MODEL || this.config.get<string>('GEMINI_MODEL') || 'gemini-3.6-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest',
    ].filter(Boolean);

    for (const modelName of candidateModels) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const prompt = `
You are an expert ATS (Applicant Tracking System) Recruiter and AI Content Forensic Analyst.
Analyze the following candidate resume against the provided Job Description.
This system processes candidates across all industries (Tech, Sales, Digital Marketing, Content Creation, Video Editing, Operations, Finance, etc.).

--- TARGET JOB DETAILS ---
Title: ${job.title}
Department: ${job.department || 'N/A'}
Required Experience (Years): ${job.experienceMin ?? 0} to ${job.experienceMax ?? 'Any'}
Description: ${job.description || 'Full-time role matching job title and requirements.'}

--- CANDIDATE RESUME TEXT ---
${resumeText}

--- YOUR TASK ---
1. AI WRITING DETECTION:
   - Carefully inspect every section (Professional Summary/Bio, Project Descriptions, Work Experience Bullet Points).
   - Determine if the resume content was generated or assisted by AI (ChatGPT, Claude, etc.) using linguistic markers, unnatural buzzword clustering, low burstiness, prompt residues (e.g. "As an AI...", "[Insert Company]"), or formulaic templates.
   - If AI-written content is detected in Bio, Projects, or Experience, mark isAiGenerated = true and provide high confidence (60-100) and specific reasons.
   - If the resume is authentic, human-written or standard template, mark isAiGenerated = false with low confidence (0-20).

2. CANDIDATE DETAILS EXTRACTION:
   - Extract First Name, Last Name, Email, Phone, Location, LinkedIn URL, GitHub URL / Portfolio URL.
   - Extract ONLY the skills, competencies, and tools that are EXPLICITLY MENTIONED in the candidate's resume text. STRICT RULE: DO NOT invent, assume, or copy any skills from the TARGET JOB DETAILS. If a skill is not written in the candidate resume, DO NOT include it in "skills".
   - Calculate total years of professional experience (0 for freshers/students).
   - Extract education degrees.

3. ATS MATCH SCORING (0 to 100):
   - Evaluate whether the candidate is a strong fit for this specific job:
     * Skills Match (45% weight): Compare candidate's skills and tools against what the role actually requires.
     * Title & Role Relevance (35% weight): How well the candidate's background, education, and career objectives align with this role and domain.
     * Experience Alignment (20% weight): For entry-level/internship roles, freshers or relevant interns should receive high or full experience points.
   - Calculate an objective, fair overall atsScore from 0 to 100.
   - List matched skills and missing/recommended skills.

Return ONLY a JSON object with this exact structure:
{
  "isAiGenerated": boolean,
  "aiConfidence": number,
  "aiDetectionReason": string,
  "flaggedSections": string[],
  "candidateInfo": {
    "firstName": string,
    "lastName": string,
    "email": string,
    "phone": string,
    "location": string,
    "linkedinUrl": string,
    "githubUrl": string
  },
  "skills": string[],
  "experienceYears": number,
  "education": string[],
  "atsScore": number,
  "matchedSkills": string[],
  "missingSkills": string[],
  "scoreBreakdown": {
    "skillsScore": number,
    "experienceScore": number,
    "relevanceScore": number
  }
}
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```')) {
          cleanJson = cleanJson.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
        }
        const parsed = JSON.parse(cleanJson) as GeminiAnalysisResult;
        if (typeof parsed.atsScore === 'number') {
          parsed.atsScore = Math.max(0, Math.min(100, Math.round(parsed.atsScore)));
        }
        this.logger.log(`Gemini analysis succeeded using model: ${modelName}. Score: ${parsed.atsScore}`);
        return parsed;
      } catch (error: any) {
        this.logger.warn(`Gemini model '${modelName}' attempt failed: ${error.message}. Trying next fallback model.`);
      }
    }

    this.logger.error('All Gemini Flash candidate models failed.');
    return null;
  }
}
