import { Module } from '@nestjs/common';
import { TerminusModule, PrismaHealthIndicator } from '@nestjs/terminus';
import { SharedModule } from '../shared/shared.module.js';
import { HealthController } from './health.controller.js';
import { RedisHealthIndicator } from './indicators/redis.health.js';

@Module({
  imports: [TerminusModule, SharedModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
