import { Test, TestingModule } from '@nestjs/testing';
import { StorageService } from './storage.service';
import { STORAGE_DRIVER_TOKEN } from './constants/storage.constants';

describe('StorageService', () => {
  let service: StorageService;
  const driver = {
    read: jest.fn().mockResolvedValue(Buffer.from('x')),
    exists: jest.fn().mockResolvedValue(false),
    getDriverName: jest.fn().mockReturnValue('s3'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: STORAGE_DRIVER_TOKEN, useValue: driver },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('delegates to the configured driver', async () => {
    expect((await service.read('ws/files/a/b.pdf')).toString()).toBe('x');
    expect(driver.read).toHaveBeenCalledWith('ws/files/a/b.pdf');
    expect(await service.exists('missing')).toBe(false);
    expect(service.getDriverName()).toBe('s3');
  });
});
