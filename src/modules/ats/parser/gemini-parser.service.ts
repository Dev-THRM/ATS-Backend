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

    try {
      const modelName =
        process.env.GEMINI_MODEL || this.config.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1, // low temperature for precise, deterministic analysis
        },
      });

      const prompt = `
You are an expert ATS (Applicant Tracking System) Recruiter and AI Content Forensic Analyst.
Analyze the following candidate resume against the provided Job Description.

--- TARGET JOB DETAILS ---
Title: ${job.title}
Department: ${job.department || 'N/A'}
Required Experience (Years): ${job.experienceMin ?? 0} to ${job.experienceMax ?? 'Any'}
Description: ${job.description}

--- CANDIDATE RESUME TEXT ---
${resumeText}

--- YOUR TASK ---
1. AI WRITING DETECTION:
   - Carefully inspect every section (Professional Summary/Bio, Project Descriptions, Work Experience Bullet Points).
   - Determine if the resume content was generated or assisted by AI (ChatGPT, Claude, etc.) using linguistic markers, unnatural buzzword clustering, low burstiness, prompt residues (e.g. "As an AI...", "[Insert Company]"), or formulaic templates.
   - If AI-written content is detected in Bio, Projects, or Experience, mark isAiGenerated = true and provide high confidence (60-100) and specific reasons.

2. CANDIDATE DETAILS EXTRACTION:
   - Extract First Name, Last Name, Email, Phone, Location, LinkedIn URL, GitHub URL.
   - Extract technical & professional skills.
   - Calculate total years of professional experience.
   - Extract education degrees.

3. ATS MATCH SCORING (0 to 100):
   - Calculate an objective ATS match score based on skill match (50%), title & keyword relevance (30%), and experience alignment (20%).
   - List matched skills and missing skills.

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
      return JSON.parse(responseText) as GeminiAnalysisResult;
    } catch (error: any) {
      this.logger.error(`Gemini Flash analysis failed: ${error.message}. Falling back to local engine.`);
      return null;
    }
  }
}
