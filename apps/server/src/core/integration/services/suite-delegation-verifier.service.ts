import { Injectable, Logger } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  DelegationError,
  IssuerPolicy,
  VerifiedAssertion,
  VerifierPolicy,
  verifyAssertion,
} from '@conqr/conqrplan-core';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { AuthAccountRepo } from '@docmost/db/repos/auth/auth-account.repo';
import { SuiteOrgIdentityRepo } from '@docmost/db/repos/integration/suite-org-identity.repo';
import { DelegationAuditRepo } from '@docmost/db/repos/integration/delegation-audit.repo';
import { isUserDisabled } from '../../../common/helpers';
import type { User, Workspace } from '@docmost/db/types/entity.types';
import {
  parseProviderOrgUid,
  parseProviderPersonUid,
} from '../domain/suite-identity.util';
import { ALL_SUITE_DELEGATED_SCOPES } from '../domain/suite-delegation-scope';

/**
 * Turn another product's assertion into a ConqrHub user and workspace.
 *
 * This is the receiving half of the delegation contract ConqrHub already
 * issues against (`conqrplan-tool-router.service.ts` mints exactly this shape
 * for the ConqrPlan MCP service). Until now Hub was the only member of the
 * suite that issued assertions and accepted none — `DelegatedTokenService.verify`
 * has no caller anywhere.
 *
 * The resolution is a chain, and every link fails closed:
 *
 *   client token      is the *caller* a service we trust at all?
 *   assertion         is it signed by a trusted issuer, for us, unexpired,
 *                     within the issuer's scope ceiling?
 *   organisation      does its `tid` name an organisation mapped, and still
 *                     active, to a workspace here?
 *   subject           does its `sub` name a provider subject linked to a user
 *                     in *that* workspace?
 *   membership        is that user still a live member of it?
 *   scope             did the assertion carry the scope this route needs?
 *
 * Two credentials rather than one, because they answer different questions.
 * The bearer token says which service is calling; the assertion says whose
 * permissions the call runs under. A service token alone would be an API key,
 * and an API key authorizes as whoever created it — which is the failure this
 * whole design exists to avoid.
 *
 * There is deliberately no partial success. Every refusal throws with a stable
 * classification and nothing is returned half-resolved, because a fallback
 * identity would turn a verification bug into a silent privilege escalation.
 */

/** A refusal, with a stable machine-readable reason for the audit trail. */
export class DelegationDenied extends Error {
  constructor(
    readonly classification: string,
    message?: string,
  ) {
    super(message ?? classification.replace(/_/g, ' '));
    this.name = 'DelegationDenied';
  }
}

/** Everything a route needs, and nothing that could be replayed. */
export interface DelegationContext {
  user: User;
  workspace: Workspace;
  /** Canonical identifiers as asserted, for the audit trail. */
  personUid: string;
  orgUid: string;
  idpKey: string;
  subject: string;
  externalOrgId: string;
  scope: string[];
  issuer: string;
  kid: string | null;
  jti: string;
}

export interface VerifyParams {
  token?: string;
  clientToken?: string;
  requiredScope?: string;
  method?: string;
  path?: string;
  correlationId?: string;
}

/** Allow-listed and bounded, because it is written to an append-only table and
 * read back in a log line. Deliberately not trimmed: a caller sending padded
 * whitespace should see its own value, not a cleaned-up one. */
function safeCorrelationId(value: string | undefined): string | null {
  if (!value) return null;
  if (value.length < 1 || value.length > 128) return null;
  return /^[A-Za-z0-9._:-]+$/.test(value) ? value : null;
}

@Injectable()
export class SuiteDelegationVerifierService {
  private readonly logger = new Logger(SuiteDelegationVerifierService.name);

  constructor(
    private readonly environment: EnvironmentService,
    private readonly userRepo: UserRepo,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly authAccountRepo: AuthAccountRepo,
    private readonly orgIdentityRepo: SuiteOrgIdentityRepo,
    private readonly auditRepo: DelegationAuditRepo,
  ) {}

  /**
   * Whether inbound delegation is configured at all.
   *
   * Unconfigured means off, and off means every request is refused. It does
   * *not* mean "skip the check": a feature that degrades to trusting the
   * caller when its configuration is missing is worse than one that is absent.
   */
  isEnabled(): boolean {
    return Boolean(
      this.environment.getSuiteIdpKey() &&
        this.environment.getConqrFabricAssertionPublicKey() &&
        this.environment.getConqrFabricAssertionKeyId() &&
        this.environment.getSuiteDelegationClientTokens().length,
    );
  }

  /**
   * The trust policy, rebuilt per call so a key rotation takes effect on the
   * next request rather than on the next restart. It is a handful of string
   * reads; caching it would trade nothing for a rotation that silently does
   * not apply.
   */
  private policy(): VerifierPolicy {
    const issuer: IssuerPolicy = {
      issuer: this.environment.getConqrFabricOboIssuer(),
      // Pinned per issuer and never read from the token, which closes
      // algorithm confusion by construction.
      algorithm: 'EdDSA',
      publicKeys: {
        [this.environment.getConqrFabricAssertionKeyId()]:
          this.environment.getConqrFabricAssertionPublicKey(),
      },
      // A scope this issuer may not assert invalidates the whole assertion
      // rather than being quietly dropped: it means the issuer is
      // misconfigured or is trying something, and both deserve to be visible.
      allowedScopes: [...ALL_SUITE_DELEGATED_SCOPES],
      maxTtlSeconds: this.environment.getSuiteDelegationMaxTtlSeconds(),
    };
    return {
      audience: this.environment.getSuiteDelegationAudience(),
      issuers: { [issuer.issuer]: issuer },
    };
  }

  /**
   * Constant-time membership test over digests.
   *
   * Digests rather than the raw values so every comparison is over equal-length
   * buffers, which is what makes the timing uninformative about the length of
   * the secret as well as its content.
   */
  private isKnownClientToken(candidate: string | undefined): boolean {
    if (!candidate) return false;
    const presented = createHash('sha256').update(candidate).digest();
    let matched = false;
    for (const known of this.environment.getSuiteDelegationClientTokens()) {
      const expected = createHash('sha256').update(known).digest();
      // No early exit: the loop runs to the end whatever it finds, so the time
      // taken does not reveal which token matched or how many are configured.
      if (timingSafeEqual(presented, expected)) matched = true;
    }
    return matched;
  }

  /**
   * Verify and resolve, or throw `DelegationDenied`.
   *
   * Records the outcome either way. The refusal path writes through
   * `appendQuietly`, because a failed audit write must not turn a clean
   * refusal into a 500 that hides the reason.
   */
  async verify(params: VerifyParams): Promise<DelegationContext> {
    const correlationId = safeCorrelationId(params.correlationId);
    let assertion: VerifiedAssertion | undefined;

    const deny = async (
      classification: string,
      extra: {
        workspaceId?: string | null;
        userId?: string | null;
      } = {},
    ): Promise<never> => {
      const claims = assertion?.claims;
      await this.auditRepo.appendQuietly({
        workspaceId: extra.workspaceId ?? null,
        userId: extra.userId ?? null,
        personUid: claims?.sub ?? null,
        orgUid: claims?.tid ?? null,
        issuer: claims?.iss ?? null,
        keyId: assertion?.kid ?? null,
        jti: claims?.jti ?? null,
        scope: claims?.scope ? JSON.stringify(claims.scope) : null,
        requiredScope: params.requiredScope ?? null,
        accepted: false,
        reason: classification,
        correlationId,
        requestMethod: params.method ?? null,
        requestPath: params.path ?? null,
      });
      throw new DelegationDenied(classification);
    };

    if (!this.isEnabled()) {
      return deny('delegation_not_configured');
    }

    // The service credential first. A caller we do not recognise never gets as
    // far as having its assertion parsed, so an unknown caller cannot use this
    // endpoint to probe which issuers or key ids Hub accepts.
    if (!this.isKnownClientToken(params.clientToken)) {
      return deny('client_unauthorized');
    }

    try {
      assertion = verifyAssertion(params.token, this.policy(), {
        requiredScope: params.requiredScope,
      });
    } catch (err) {
      if (err instanceof DelegationError) {
        return deny(err.classification);
      }
      // An unexpected failure is still a refusal. Verification that throws
      // something we did not anticipate has not succeeded.
      this.logger.error(
        `Unexpected delegation verification failure: ${(err as Error).message}`,
      );
      return deny('delegation_verification_failed');
    }

    const claims = assertion.claims;
    const idpKey = this.environment.getSuiteIdpKey();

    // The organisation half. Parsed with the provider-aware reader, never with
    // `hubIdFromOrgUid`: these identifiers do not carry a ConqrHub row id and
    // treating them as though they did is exactly the coupling the canonical
    // identifiers exist to prevent.
    const org = parseProviderOrgUid(claims.tid);
    if (!org) return deny('delegation_bad_tenant');
    const person = parseProviderPersonUid(claims.sub);
    if (!person) return deny('delegation_bad_subject');

    // Both halves must name the provider this Hub federates to. Without this a
    // trusted issuer could assert a subject from some other provider whose
    // numeric ids happen to collide with ours.
    if (org.idpKey !== idpKey || person.idpKey !== idpKey) {
      return deny('identity_provider_mismatch');
    }

    const mapping = await this.orgIdentityRepo.findActive(
      idpKey,
      org.externalId,
    );
    // Unknown and revoked are the same answer on purpose: distinguishing them
    // would tell a caller which organisations exist here.
    if (!mapping) return deny('org_unmapped');

    const workspace = await this.workspaceRepo.findById(mapping.workspaceId);
    if (!workspace || workspace.deletedAt) {
      return deny('workspace_unavailable', { workspaceId: mapping.workspaceId });
    }

    // Scoped to the workspace the organisation resolved to, which is what makes
    // "the right person in the wrong workspace" a refusal rather than a
    // successful call against somebody else's tenant.
    const account = await this.authAccountRepo.findByProviderSubject(
      idpKey,
      person.externalId,
      workspace.id,
    );
    if (!account) return deny('identity_unmapped', { workspaceId: workspace.id });

    // Hub users are workspace-scoped rows, so this lookup *is* the membership
    // check: a user id that does not resolve inside this workspace is not a
    // member of it.
    const user = await this.userRepo.findById(account.userId, workspace.id);
    if (!user) {
      return deny('user_not_a_member', {
        workspaceId: workspace.id,
        userId: account.userId,
      });
    }
    if (isUserDisabled(user)) {
      return deny('user_disabled', {
        workspaceId: workspace.id,
        userId: user.id,
      });
    }

    await this.auditRepo.appendQuietly({
      workspaceId: workspace.id,
      userId: user.id,
      personUid: claims.sub,
      orgUid: claims.tid,
      issuer: claims.iss,
      keyId: assertion.kid,
      jti: claims.jti,
      scope: JSON.stringify(claims.scope),
      requiredScope: params.requiredScope ?? null,
      accepted: true,
      reason: null,
      correlationId,
      requestMethod: params.method ?? null,
      requestPath: params.path ?? null,
    });

    return {
      user,
      workspace,
      personUid: claims.sub,
      orgUid: claims.tid,
      idpKey,
      subject: person.externalId,
      externalOrgId: org.externalId,
      scope: claims.scope,
      issuer: claims.iss,
      kid: assertion.kid,
      jti: claims.jti,
    };
  }
}
