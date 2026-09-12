import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import express from 'express';
import * as path from 'node:path';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { initSentry } from './common/sentry/sentry.init.js';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter.js';

// Initialize Sentry before bootstrapping if DSN is provided
initSentry();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Use structured logger (Pino)
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Apply Helmet HTTP security headers (allow cross-origin for local asset preview like resumes/logos)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // Swagger and static asset compatibility
    }),
  );

  // Serve local uploads/storage files
  app.use('/storage', express.static(path.resolve(process.cwd(), 'storage')));

  // Environment-controlled CORS with intelligent development fallback
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
  const allowedOrigins = allowedOriginsEnv
    ? allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:8081',
        'http://127.0.0.1:5173',
        'http://10.0.2.2:3000',
        'http://10.0.2.2:8081',
      ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server, health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In development, be permissive of any localhost/127.0.0.1 port
      if (
        process.env.NODE_ENV !== 'production' &&
        (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  });

  // Global prefix for versioned APIs
  app.setGlobalPrefix('api/v1');

  // Global exception filter for Sentry tracking
  app.useGlobalFilters(new SentryExceptionFilter());

  // Global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Setup Swagger / OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ATS-HRMS-CRM Platform API')
    .setDescription(
      'Multi-tenant enterprise ATS backend with AI resume scoring, candidate WhatsApp messaging, and interview scheduling.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on http://localhost:${port}/api/v1`);
  logger.log(`Swagger documentation available at http://localhost:${port}/docs`);
}
await bootstrap();

