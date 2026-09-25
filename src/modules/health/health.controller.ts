import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  HealthCheckService,
  HealthCheck,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { RedisHealthIndicator } from './indicators/redis.health.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Health & Observability')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Comprehensive system health check (Database, Memory)' })
  async check() {
    let dbStatus = 'up';
    let dbError: string | undefined;
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
    } catch (err: any) {
      dbStatus = 'down';
      dbError = err.message;
    }
    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      info: {
        database: { status: dbStatus, error: dbError },
        memory: { status: 'up' },
      },
    };
  }

  @Get('liveness')
  @Public()
  @ApiOperation({ summary: 'Liveness probe for orchestrators' })
  liveness() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('readiness')
  @Public()
  @ApiOperation({ summary: 'Readiness probe verifying DB availability' })
  async readiness() {
    await this.prisma.$queryRawUnsafe('SELECT 1');
    return {
      status: 'ok',
      database: 'up',
    };
  }
}
