import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import express from 'express';
import * as path from 'node:path';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Serve local uploads/storage files
  app.use('/storage', express.static(path.resolve(process.cwd(), 'storage')));

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global prefix for versioned APIs
  app.setGlobalPrefix('api/v1');

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
  console.log(`Application running on http://localhost:${port}/api/v1`);
  console.log(`Swagger documentation available at http://localhost:${port}/docs`);
}
await bootstrap();

