import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SharedModule } from './modules/shared/shared.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AtsModule } from './modules/ats/ats.module.js';
import { HrmsModule } from './modules/hrms/hrms.module.js';
import { CrmModule } from './modules/crm/crm.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 120, // 120 requests per minute by default
      },
    ]),
    SharedModule,
    AuthModule,
    AtsModule,
    HrmsModule,
    CrmModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}



