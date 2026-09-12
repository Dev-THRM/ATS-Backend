import { Controller, Get } from '@nestjs/common';
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
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Comprehensive system health check (Database, Redis, Memory)' })
  async check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redisHealth.isHealthy('redis'),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024), // 512MB heap threshold
    ]);
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
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe verifying DB and Redis availability' })
  async readiness() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redisHealth.isHealthy('redis'),
    ]);
  }
}
