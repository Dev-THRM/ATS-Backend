import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationsController } from './applications.controller.js';
import { ApplicationsService } from './applications.service.js';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;
  let service: ApplicationsService;

  const mockOrgId = 'org-123';
  const mockUserId = 'user-456';

  beforeEach(() => {
    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      getTimeline: vi.fn(),
      moveToStage: vi.fn(),
      updateStatus: vi.fn(),
      remove: vi.fn(),
    } as unknown as ApplicationsService;

    controller = new ApplicationsController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create application', async () => {
    const dto = {
      jobId: 'job-1',
      candidateId: 'cand-1',
    };

    vi.spyOn(service, 'create').mockResolvedValue({
      id: 'app-1',
      ...dto,
    } as any);

    const result = await controller.create(mockOrgId, mockUserId, dto);
    expect(result.application.id).toBe('app-1');
    expect(service.create).toHaveBeenCalledWith(mockOrgId, dto, mockUserId);
  });

  it('should moveToStage', async () => {
    vi.spyOn(service, 'moveToStage').mockResolvedValue({
      id: 'app-1',
      currentStageId: 'st-interview',
    } as any);

    const result = await controller.moveToStage(
      mockOrgId,
      mockUserId,
      'app-1',
      {
        stageId: 'st-interview',
      },
    );
    expect(result.currentStageId).toBe('st-interview');
    expect(service.moveToStage).toHaveBeenCalledWith(
      mockOrgId,
      'app-1',
      'st-interview',
      undefined,
      mockUserId,
      true,
      undefined,
      undefined,
    );
  });

  it('should get timeline', async () => {
    vi.spyOn(service, 'getTimeline').mockResolvedValue([
      { id: 'log-1', toStageName: 'Applied' },
    ] as any);

    const result = await controller.getTimeline(mockOrgId, 'app-1');
    expect(result).toHaveLength(1);
    expect(service.getTimeline).toHaveBeenCalledWith(mockOrgId, 'app-1');
  });
});
