import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';

describe('ATS Candidates Bulk Import E2E Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testOrgSlug = `bulk-import-org-${Date.now()}`;
  const testEmail = `recruiter-bulk-${Date.now()}@example.com`;
  let accessToken: string;
  let jobId: string;

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

    // Register tenant with ATS plan
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send({
        organizationName: 'Oracle Cloud Imports Ltd',
        organizationSlug: testOrgSlug,
        firstName: 'Larry',
        lastName: 'Recruiter',
        email: testEmail,
        password: 'Password123!',
      })
      .expect(201);

    accessToken = regRes.body.tokens.accessToken;

    // Create a job for linking imported candidates
    const jobRes = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Principal Cloud Architect',
        department: 'Infrastructure',
        location: 'Bengaluru, India',
        employmentType: 'FULL_TIME',
        experienceLevel: 'LEAD',
      })
      .expect(201);

    jobId = jobRes.body.job?.id || jobRes.body.id;
  });

  afterAll(async () => {
    if (prisma) {
      const org = await prisma.organization.findUnique({
        where: { slug: testOrgSlug },
      });
      if (org) {
        await prisma.organization.delete({ where: { id: org.id } });
      }
    }
    await app.close();
  });

  it('1. Download CSV import template (GET /api/v1/ats/candidates/import-template.csv)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ats/candidates/import-template.csv')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.header['content-type']).toContain('text/csv');
    expect(res.text).toContain('First Name,Last Name,Email');
    expect(res.text).toContain('NAUKRI');
    expect(res.text).toContain('LINKEDIN');
  });

  it('2. Bulk import candidates via JSON/CSV data (POST /api/v1/ats/candidates/bulk-import-csv)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates/bulk-import-csv')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        defaultSource: 'NAUKRI',
        jobId,
        candidates: [
          {
            firstName: 'Aarav',
            lastName: 'Patel',
            email: 'aarav.patel@example.com',
            phone: '+919876543210',
            currentCompany: 'Infosys',
            currentTitle: 'Senior Cloud Developer',
            location: 'Bengaluru',
            skills: ['Kubernetes', 'Go', 'Docker', 'AWS'],
            source: 'NAUKRI',
          },
          {
            firstName: 'Sneha',
            lastName: 'Reddy',
            email: 'sneha.reddy@example.com',
            phone: '+919876543211',
            currentCompany: 'Wipro',
            currentTitle: 'Backend Engineer',
            location: 'Hyderabad',
            skills: ['Java', 'Spring Boot', 'Kafka'],
            source: 'LINKEDIN',
          },
          {
            firstName: 'Rahul',
            lastName: 'Deshmukh',
            email: 'rahul.deshmukh@example.com',
            skills: ['React', 'TypeScript', 'Node.js'],
            source: 'UNSTOP',
          },
        ],
      })
      .expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.created).toBe(3);
    expect(res.body.applicationsCreated).toBe(3);
    expect(res.body.candidates).toHaveLength(3);

    // Verify candidate sources in DB
    const cand = await prisma.candidate.findFirst({
      where: { email: 'aarav.patel@example.com' },
    });
    expect(cand?.source).toBe('NAUKRI');
    expect(cand?.skills).toContain('Kubernetes');

    // Verify application created
    const application = await prisma.application.findFirst({
      where: { candidateId: cand?.id, jobId },
    });
    expect(application).toBeDefined();
    expect(application?.source).toBe('NAUKRI');
    expect(application?.status).toBe('ACTIVE');
  });

  it('3. Re-importing existing candidates updates skills & merges data gracefully', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates/bulk-import-csv')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        defaultSource: 'CSV_UPDATE',
        candidates: [
          {
            firstName: 'Aarav',
            lastName: 'Patel',
            email: 'aarav.patel@example.com',
            currentCompany: 'Google Cloud',
            skills: ['Terraform', 'GCP'],
          },
        ],
      })
      .expect(200);

    expect(res.body.updated).toBe(1);
    expect(res.body.created).toBe(0);

    const updated = await prisma.candidate.findFirst({
      where: { email: 'aarav.patel@example.com' },
    });
    expect(updated?.currentCompany).toBe('Google Cloud');
    expect(updated?.skills).toContain('Kubernetes');
    expect(updated?.skills).toContain('Terraform');
  });

  it('4. Query candidates filtered by imported source', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ats/candidates?source=LINKEDIN')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('sneha.reddy@example.com');
  });
});
