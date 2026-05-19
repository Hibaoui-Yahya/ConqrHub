import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { v7 as uuid7 } from 'uuid';
import { ApiKeyRepo } from './api-key.repo';
import { TokenService } from '../../core/auth/services/token.service';
import { ApiKey } from '@docmost/db/types/entity.types';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { isUserDisabled } from '../../common/helpers';

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    private readonly repo: ApiKeyRepo,
    private readonly tokenService: TokenService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
  ) {}

  async create(opts: {
    name: string;
    userId: string;
    workspaceId: string;
    expiresAt?: Date;
  }): Promise<{ apiKey: ApiKey; token: string }> {
    const id = uuid7();

    const token = await this.tokenService.generateApiToken({
      apiKeyId: id,
      user: { id: opts.userId, workspaceId: opts.workspaceId } as any,
      workspaceId: opts.workspaceId,
      expiresIn: opts.expiresAt
        ? Math.max(0, Math.floor((opts.expiresAt.getTime() - Date.now()) / 1000))
        : undefined,
    });

    const apiKey = await this.repo.insert({
      id,
      name: opts.name,
      creatorId: opts.userId,
      workspaceId: opts.workspaceId,
      expiresAt: opts.expiresAt ?? null,
    } as any);

    return { apiKey, token };
  }

  async list(opts: {
    workspaceId: string;
    cursor?: string;
    limit?: number;
    creatorId?: string;
  }): Promise<ApiKey[]> {
    return this.repo.findByWorkspaceId(opts.workspaceId, {
      cursor: opts.cursor,
      limit: opts.limit,
      creatorId: opts.creatorId,
    });
  }

  async update(
    apiKeyId: string,
    workspaceId: string,
    name: string,
  ): Promise<void> {
    await this.repo.update(apiKeyId, workspaceId, { name });
  }

  async revoke(apiKeyId: string, workspaceId: string): Promise<void> {
    await this.repo.revoke(apiKeyId, workspaceId);
  }

  /**
   * Called by JwtStrategy to validate an API key token.
   * Returns { user, workspace } on success.
   */
  async validateApiKey(payload: {
    sub: string;
    workspaceId: string;
    apiKeyId: string;
  }): Promise<{ user: any; workspace: any }> {
    const apiKey = await this.repo.findById(
      payload.apiKeyId,
      payload.workspaceId,
    );

    if (!apiKey) {
      throw new UnauthorizedException('API key not found');
    }

    if (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    // Update last_used_at
    await this.repo.update(payload.apiKeyId, payload.workspaceId, {
      lastUsedAt: new Date(),
    });

    const [user, workspace] = await Promise.all([
      this.userRepo.findById(payload.sub, payload.workspaceId),
      this.workspaceRepo.findById(payload.workspaceId),
    ]);

    if (!user || isUserDisabled(user) || !workspace) {
      throw new UnauthorizedException('API key user or workspace not found');
    }

    return { user, workspace };
  }
}
