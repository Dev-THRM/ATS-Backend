import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CandidatesService } from './candidates.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let prisma: PrismaService;

  const mockOrgId = 'org-123';

  beforeEach(() => {
    prisma = {
      candidate: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      job: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue({ name: 'Acme Corp' }),
      },
    } as unknown as PrismaService;

    service = new CandidatesService(prisma);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create candidate if email does not exist for org', async () => {
      const dto = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        skills: ['TypeScript', 'NestJS'],
      };

      vi.spyOn(prisma.candidate, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.candidate, 'create').mockResolvedValue({
        id: 'cand-1',
        organizationId: mockOrgId,
        ...dto,
      } as any);

      const result = await service.create(mockOrgId, dto);

      expect(result.id).toBe('cand-1');
      expect(prisma.candidate.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if candidate email already exists in org', async () => {
      const dto = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
      };

      vi.spyOn(prisma.candidate, 'findUnique').mockResolvedValue({
        id: 'cand-1',
        email: 'jane@example.com',
      } as any);

      await expect(service.create(mockOrgId, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated list of candidates', async () => {
      vi.spyOn(prisma.candidate, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.candidate, 'findMany').mockResolvedValue([
        {
          id: 'cand-1',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          _count: { applications: 2 },
        } as any,
      ]);

      const result = await service.findAll(mockOrgId, { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return candidate by ID with applications', async () => {
      vi.spyOn(prisma.candidate, 'findFirst').mockResolvedValue({
        id: 'cand-1',
        firstName: 'Jane',
        applications: [],
      } as any);

      const result = await service.findOne(mockOrgId, 'cand-1');
      expect(result.id).toBe('cand-1');
    });

    it('should throw NotFoundException if candidate not found', async () => {
      vi.spyOn(prisma.candidate, 'findFirst').mockResolvedValue(null);

      await expect(service.findOne(mockOrgId, 'wrong-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
