import { Injectable } from '@nestjs/common';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import {
  DelegatedClaims,
  mintDelegatedToken,
  verifyDelegatedToken,
  VerifyResult,
} from '../domain/delegated-token.util';

const DEFAULT_TTL_SECONDS = 300; // short-lived (§9.1)

/**
 * Issues/validates on-behalf-of tokens for cross-product calls (blueprint §9.1).
 * Preserves the acting user's identity end-to-end instead of a bot; tokens are
 * short-lived, audience-bound, and least-privilege. Signed with the rotating
 * app secret.
 */
@Injectable()
export class DelegatedTokenService {
  constructor(private readonly environment: EnvironmentService) {}

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  mint(params: {
    actorId: string;
    workspaceId: string;
    audience: string;
    scope: string[];
    ttlSeconds?: number;
  }): string {
    return mintDelegatedToken(
      {
        sub: params.actorId,
        tid: params.workspaceId,
        aud: params.audience,
        scope: params.scope,
        ttlSeconds: params.ttlSeconds ?? DEFAULT_TTL_SECONDS,
        nowSeconds: this.now(),
      },
      this.environment.getAppSecret(),
    );
  }

  verify(
    token: string | undefined,
    audience: string,
    requiredScope?: string,
  ): VerifyResult {
    return verifyDelegatedToken(
      token,
      { audience, requiredScope, nowSeconds: this.now() },
      this.environment.getAppSecret(),
    );
  }
}

export type { DelegatedClaims };
