// PageService drags in the ProseMirror helpers, which load happy-dom as ESM
// (outside transformIgnorePatterns); the scaffold never renders HTML.
jest.mock('happy-dom', () => ({ Window: class {} }));
// ... and the collaboration gateway loads yjs/lib0, ESM as well.
jest.mock('../../collaboration/collaboration.gateway', () => ({ CollaborationGateway: class {} }));
import { Test, TestingModule } from '@nestjs/testing';
import { CommentService } from './comment.service';

describe('CommentService', () => {
  let service: CommentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommentService],
    })
      // Every constructor dependency is replaced by an empty double: this checks
      // that the class and its declared dependencies resolve, not their behaviour.
      .useMocker(() => ({}))
      .compile();

    service = module.get<CommentService>(CommentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
