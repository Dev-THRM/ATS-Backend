import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../../common/guards/plan.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { JobsService } from './jobs.service.js';
import { PipelineStagesService } from './pipeline-stages.service.js';
import { CreateJobDto } from './dto/create-job.dto.js';
import { UpdateJobDto } from './dto/update-job.dto.js';
import { QueryJobsDto } from './dto/query-jobs.dto.js';
import { UpdateJobStatusDto } from './dto/update-job-status.dto.js';
import { ReorderStagesDto } from './dto/reorder-stages.dto.js';

@Controller('ats/jobs')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.ATS)
export class JobsController {
  constructor(
    @Inject(JobsService) private readonly jobsService: JobsService,
    @Inject(PipelineStagesService)
    private readonly pipelineStagesService: PipelineStagesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
  )
  @Permissions('jobs:create')
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('userId') userId: string,
    @Body() createJobDto: CreateJobDto,
  ) {
    const job = await this.jobsService.create(orgId, userId, createJobDto);
    return {
      message: 'Job posting created successfully',
      job,
    };
  }

  @Get()
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('jobs:read')
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: QueryJobsDto,
  ) {
    return this.jobsService.findAll(orgId, query);
  }

  @Get(':id')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('jobs:read')
  findOne(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.jobsService.findOne(orgId, id);
  }

  @Patch(':id')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
  )
  @Permissions('jobs:update')
  update(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() updateJobDto: UpdateJobDto,
  ) {
    return this.jobsService.update(orgId, id, updateJobDto);
  }

  @Patch(':id/status')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
  )
  @Permissions('jobs:publish')
  updateStatus(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    return this.jobsService.updateStatus(orgId, id, dto.status);
  }

  @Delete(':id')
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN)
  @Permissions('jobs:delete')
  remove(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.jobsService.remove(orgId, id);
  }

  @Get(':id/stages')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('jobs:read')
  getStages(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.pipelineStagesService.getStagesForJob(id, orgId);
  }

  @Put(':id/stages/reorder')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
  )
  @Permissions('jobs:update')
  reorderStages(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: ReorderStagesDto,
  ) {
    return this.pipelineStagesService.reorderStages(id, orgId, dto.stages);
  }

  @Get(':id/share-links')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('jobs:read')
  getShareLinks(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.jobsService.getShareLinks(orgId, id);
  }
}
