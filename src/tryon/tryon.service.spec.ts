import { Test, TestingModule } from '@nestjs/testing';
import { TryonService } from './tryon.service';

describe('TryonService', () => {
  let service: TryonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TryonService],
    }).compile();

    service = module.get<TryonService>(TryonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
