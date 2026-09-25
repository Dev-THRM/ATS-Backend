import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { AtsController } from './ats.controller.js';
import { JobsController } from './jobs/jobs.controller.js';
import { JobsService } from './jobs/jobs.service.js';
import { PipelineStagesService } from './jobs/pipeline-stages.service.js';
import { CandidatesController } from './candidates/candidates.controller.js';
import { CandidatesService } from './candidates/candidates.service.js';
import { ApplicationsController } from './applications/applications.controller.js';
import { ApplicationsService } from './applications/applications.service.js';
import { ResumesController } from './resumes/resumes.controller.js';
import { ResumesService } from './resumes/resumes.service.js';
import { ResumeParserService } from './parser/resume-parser.service.js';
import { AiDetectorService } from './parser/ai-detector.service.js';
import { GeminiParserService } from './parser/gemini-parser.service.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { CalendarService } from './interviews/calendar.service.js';
import { InterviewsController } from './interviews/interviews.controller.js';
import { InterviewsService } from './interviews/interviews.service.js';
import { AtsDashboardService } from './ats-dashboard.service.js';
import { PublicCareerController } from './public/public-career.controller.js';
import { PublicCareerService } from './public/public-career.service.js';

@Module({
  imports: [SharedModule, NotificationsModule],
  controllers: [
    AtsController,
    JobsController,
    CandidatesController,
    ApplicationsController,
    ResumesController,
    InterviewsController,
    PublicCareerController,
  ],
  providers: [
    JobsService,
    PipelineStagesService,
    CandidatesService,
    ResumesService,
    ResumeParserService,
    AiDetectorService,
    GeminiParserService,
    ApplicationsService,
    CalendarService,
    InterviewsService,
    AtsDashboardService,
    PublicCareerService,
  ],
  exports: [
    NotificationsModule,
    JobsService,
    PipelineStagesService,
    CandidatesService,
    ApplicationsService,
    ResumesService,
    ResumeParserService,
    AiDetectorService,
    GeminiParserService,
    CalendarService,
    InterviewsService,
    AtsDashboardService,
    PublicCareerService,
  ],
})
export class AtsModule {}
