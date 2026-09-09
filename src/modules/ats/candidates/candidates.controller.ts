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
  UseInterceptors,
  UploadedFiles,
  Res,
  Header,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../../common/guards/plan.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { CandidatesService } from './candidates.service.js';
import { CreateCandidateDto } from './dto/create-candidate.dto.js';
import { UpdateCandidateDto } from './dto/update-candidate.dto.js';
import { QueryCandidatesDto } from './dto/query-candidates.dto.js';
import { BulkImportCsvDto } from './dto/bulk-import.dto.js';

@Controller('ats/candidates')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.ATS)
export class CandidatesController {
  constructor(
    @Inject(CandidatesService)
    private readonly candidatesService: CandidatesService,
  ) {}

  @Get('import-template.csv')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="candidates_import_template.csv"')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  getTemplateCsv(@Res() res: Response) {
    const csv = this.candidatesService.getCsvTemplate();
    return res.send(csv);
  }

  @Post('bulk-import-csv')
  @HttpCode(HttpStatus.OK)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('candidates:create')
  async bulkImportCsv(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: BulkImportCsvDto,
  ) {
    return this.candidatesService.bulkImportCsv(orgId, dto);
  }

  @Post('bulk-import-resumes')
  @UseInterceptors(
    FilesInterceptor('resumes', 25, {
      limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit per resume
    }),
  )
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('candidates:create')
  async bulkImportResumes(
    @CurrentUser('organizationId') orgId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('defaultSource') defaultSource?: string,
    @Body('jobId') jobId?: string,
  ) {
    return this.candidatesService.bulkImportResumes(
      orgId,
      files || [],
      defaultSource || 'RESUME_BATCH',
      jobId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('candidates:create')
  async create(
    @CurrentUser('organizationId') orgId: string,
    @Body() dto: CreateCandidateDto,
  ) {
    const candidate = await this.candidatesService.create(orgId, dto);
    return {
      message: 'Candidate created successfully',
      candidate,
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
  @Permissions('candidates:read')
  findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: QueryCandidatesDto,
  ) {
    return this.candidatesService.findAll(orgId, query);
  }

  @Get(':id')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
    SystemRoleType.EMPLOYEE,
  )
  @Permissions('candidates:read')
  findOne(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.candidatesService.findOne(orgId, id);
  }

  @Patch(':id')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  @Permissions('candidates:update')
  update(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCandidateDto,
  ) {
    return this.candidatesService.update(orgId, id, dto);
  }

  @Delete(':id')
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN)
  @Permissions('candidates:delete')
  remove(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.candidatesService.remove(orgId, id);
  }
}
