import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed.jwt.token'),
            verifyAsync: jest.fn(),
          },
        },
        {
          provide: EnvironmentService,
          useValue: { getAppSecret: () => 'test-secret' },
        },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('mints an MCP access token with audience + scope claims', async () => {
    const jwt = module_jwt();
    const token = await service.generateMcpAccessToken({
      apiKeyId: 'key-1',
      user: { id: 'user-1' } as any,
      workspaceId: 'ws-1',
      audience: 'https://app.conqrhub.com/mcp',
      scope: 'mcp',
      expiresInSeconds: 3600,
    });
    expect(token).toBe('signed.jwt.token');
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'api_key',
        apiKeyId: 'key-1',
        aud: 'https://app.conqrhub.com/mcp',
        scope: 'mcp',
      }),
      { expiresIn: 3600 },
    );
  });

  // Access the JwtService mock the service was constructed with.
  function module_jwt(): { sign: jest.Mock } {
    return (service as any).jwtService;
  }
});
