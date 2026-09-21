import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../../common/guards/plan.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { ApplicationsService } from './applications.service.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { QueryApplicationsDto } from './dto/query-applications.dto.js';
import { UpdateApplicationStageDto } from './dto/update-application-stage.dto.js';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto.js';
import { AiDecisionDto } from './dto/ai-decision.dto.js';

@Controller('ats/applications')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.ATS)
export class ApplicationsController {
  constructor(
    @Inject(ApplicationsService)
    private readonly applicationsService: ApplicationsService,
  ) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('applications:create')
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateApplicationDto,
  ) {
    const application = await this.applicationsService.create(
      orgId,
      dto,
      userId,
    );
    return {
      message: 'Application submitted successfully',
      application,
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
  @Permissions('applications:read')
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: QueryApplicationsDto,
  ) {
    return this.applicationsService.findAll(orgId, query);
  }

  @Get(':id')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('applications:read')
  findOne(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.applicationsService.findOne(orgId, id);
  }

  @Get(':id/timeline')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('applications:read')
  getTimeline(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.applicationsService.getTimeline(orgId, id);
  }

  @Get(':id/ats-score')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('applications:read')
  getAtsScore(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.applicationsService.getAtsScore(orgId, id);
  }

  @Post(':id/reparse')
  @HttpCode(HttpStatus.OK)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('applications:update')
  reparseApplication(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.applicationsService.reparseApplication(orgId, id);
  }

  @Patch(':id/stage')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('applications:update')
  moveToStage(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStageDto,
  ) {
    const targetStageId = dto.stageId || dto.toStageId;
    if (!targetStageId) {
      throw new BadRequestException('stageId or toStageId is required');
    }
    return this.applicationsService.moveToStage(
      orgId,
      id,
      targetStageId,
      dto.rejectionReason,
      userId,
      dto.sendEmail !== false,
      dto.customNotes,
      dto.joiningDate,
    );
  }

  @Patch(':id/status')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('applications:update')
  updateStatus(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(
      orgId,
      id,
      dto.status,
      dto.rejectionReason,
    );
  }

  @Patch(':id/ai-decision')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('applications:update')
  handleAiDecision(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: AiDecisionDto,
  ) {
    return this.applicationsService.handleAiDecision(
      orgId,
      id,
      dto.decision,
      dto.reason,
      dto.sendEmail !== false,
      userId,
    );
  }

  @Delete(':id')
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN)
  @Permissions('applications:delete')
  remove(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.applicationsService.remove(orgId, id);
  }
}
