import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';

describe('Phase 0: Complete Auth, RBAC & Plan-Gating E2E Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testOrgSlug = `e2e-org-${Date.now()}`;
  const testEmail = `e2e-user-${Date.now()}@example.com`;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  }, 20000);

  afterAll(async () => {
    // Cleanup the created test organization from Neon DB
    const org = await prisma.organization.findUnique({
      where: { slug: testOrgSlug },
    });
    if (org) {
      await prisma.organization.delete({
        where: { id: org.id },
      });
    }
    await app.close();
  });

  // 1. Slug availability check
  it('1. Check slug availability (GET /api/v1/auth/check-slug)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/auth/check-slug?slug=${testOrgSlug}`)
      .expect(200);

    expect(res.body.available).toBe(true);
    expect(res.body.slug).toBe(testOrgSlug);
  });

  // 2. Register with ATS plan only
  it('2. Register tenant with ONLY ATS plan (POST /api/v1/auth/register?plan=ATS)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send({
        organizationName: 'E2E Testing Org',
        organizationSlug: testOrgSlug,
        firstName: 'E2E',
        lastName: 'Admin',
        email: testEmail,
        password: 'Password123!',
      })
      .expect(201);

    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(testEmail.toLowerCase());
    expect(res.body.user.role.type).toBe('SUPER_ADMIN');
    expect(res.body.user.organization.activePlans).toEqual(['ATS']);
    expect(res.body.tokens.accessToken).toBeDefined();
    expect(res.body.tokens.refreshToken).toBeDefined();

    accessToken = res.body.tokens.accessToken;
    refreshToken = res.body.tokens.refreshToken;
    userId = res.body.user.id;
  }, 15000);

  // 3. Login
  it('3. Login with credentials (POST /api/v1/auth/login)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: testEmail,
        password: 'Password123!',
        organizationSlug: testOrgSlug,
      })
      .expect(200);

    expect(res.body.user.id).toBe(userId);
    expect(res.body.tokens.accessToken).toBeDefined();

    // Update tokens
    accessToken = res.body.tokens.accessToken;
    refreshToken = res.body.tokens.refreshToken;
  });

  // 4. Profile /auth/me
  it('4. Get authenticated user profile (GET /api/v1/auth/me)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me?includePermissions=true')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(userId);
    expect(res.body.role.type).toBe('SUPER_ADMIN');
    expect(res.body.organization.activePlans).toContain('ATS');
  });

  // 5. RBAC & Plan SUCCESS: ATS Module (Allowed because org has ATS)
  it('5. Access ATS module route (POST /api/v1/ats/jobs) -> 201 Created', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Full Stack Engineer',
        department: 'Engineering',
        location: 'Remote',
      })
      .expect(201);

    expect(res.body.message).toBe('Job posting created successfully');
    expect(res.body.job.title).toBe('Full Stack Engineer');
  });

  // 6. Auth REJECTION: No token on protected route -> 401 Unauthorized
  it('6. Access protected route without token -> 401 Unauthorized', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/ats/dashboard')
      .expect(401);
  });

  // 9. Rotate Refresh Token
  it('9. Rotate refresh token (POST /api/v1/auth/refresh)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  // 10. Logout & Invalidate
  it('10. Logout user (POST /api/v1/auth/logout)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.message).toBe('Logged out successfully');

    // Attempting to refresh token after logout must fail
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
