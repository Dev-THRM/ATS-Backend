import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import express from 'express';
import * as path from 'node:path';
import { AppModule } from './app.module.js';
import { initSentry } from './common/sentry/sentry.init.js';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter.js';

// Initialize Sentry before bootstrapping if DSN is provided
initSentry();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Apply Helmet HTTP security headers (allow cross-origin for local asset preview like resumes/logos)
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // Swagger and static asset compatibility
    }),
  );

  // Serve local uploads/storage files with clean fallback
  const storageDir = path.resolve(process.cwd(), 'storage');
  app.use('/storage', express.static(storageDir));
  app.use('/storage', (_req: express.Request, res: express.Response) => {
    res.status(404).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Document File Unavailable</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #334155; }
    .card { background: white; padding: 2.5rem 2rem; border-radius: 1rem; border: 1px solid #e2e8f0; text-align: center; max-width: 440px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05); }
    .icon { width: 44px; height: 44px; margin: 0 auto 1rem; color: #94a3b8; }
    h2 { margin: 0 0 0.5rem; color: #0f172a; font-size: 1.15rem; font-weight: 700; }
    p { font-size: 0.85rem; color: #64748b; margin: 0; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="9" y1="15" x2="15" y2="15"></line>
    </svg>
    <h2>Original Document Not Stored Locally</h2>
    <p>The original binary file for this candidate is not stored on this local disk. You can switch to the <strong>Digital</strong> tab above to review the candidate's profile, or upload a new resume file.</p>
  </div>
</body>
</html>`);
  });

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
      // In development, be permissive of localhost, 127.0.0.1 and private LAN addresses (for mobile device testing)
      if (
        process.env.NODE_ENV !== 'production' &&
        (origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:') ||
          /^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[0-1]))\./.test(origin))
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
    .setTitle('ATS Platform API')
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
bootstrap().catch((err) => {
  console.error('Error starting application', err);
  process.exit(1);
});
