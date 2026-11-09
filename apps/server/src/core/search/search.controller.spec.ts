import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './search.controller';

describe('SearchController', () => {
  let controller: SearchController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
    })
      // Every constructor dependency is replaced by an empty double: this checks
      // that the class and its declared dependencies resolve, not their behaviour.
      .useMocker(() => ({}))
      .compile();

    controller = module.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
