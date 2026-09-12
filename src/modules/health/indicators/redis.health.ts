import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
      const client = new Redis(redisUrl, {
        lazyConnect: true,
        connectTimeout: 2000,
        maxRetriesPerRequest: 1,
      });

      await client.connect();
      const ping = await client.ping();
      await client.quit();

      if (ping === 'PONG') {
        return this.getStatus(key, true);
      }

      throw new Error(`Unexpected Redis response: ${ping}`);
    } catch (error: any) {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
