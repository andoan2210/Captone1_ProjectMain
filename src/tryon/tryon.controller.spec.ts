import { Test, TestingModule } from '@nestjs/testing';
import { TryonController } from './tryon.controller';
import { TryonService } from './tryon.service';

describe('TryonController', () => {
  let controller: TryonController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TryonController],
      providers: [TryonService],
    }).compile();

    controller = module.get<TryonController>(TryonController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
