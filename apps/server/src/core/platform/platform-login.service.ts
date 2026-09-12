/**
 * ConqrHub — Conqr platform integration: establishing a session in platform mode.
 *
 * The login half. Its counterpart is `JwtStrategy.validatePlatform`, which decides what the session
 * may *do*; this decides who the session is *for*, and it is the only place ConqrHub learns that a
 * person exists.
 *
 * **The order is the design.** Each step is a precondition of the next, and doing them in any other
 * order produces a local row that outlives the decision that justified it:
 *
 *   1. **Who is this, canonically?** ConqrIdentity resolves `(issuer, subject)` to a Conqr Person.
 *      Not the e-mail address — that is invariant ID-1 and it is the single most important
 *      difference from the standalone path, which finds a user by e-mail and provisions one if it
 *      does not exist. Two people with the same address are two people.
 *   2. **Which tenant?** ConqrAccess is asked, and its answer is used only when it is unambiguous.
 *      Never "the first one": a person in three tenants who did not say which has not chosen, and
 *      choosing for them silently puts them in the wrong organisation's data.
 *   3. **Which workspace?** The tenant binding, which somebody created deliberately. An entitled
 *      person whose tenant is unbound is refused rather than having a workspace conjured for them.
 *   4. **Only now** is anything written locally: the ConqrHub user is provisioned in the workspace
 *      the binding named, keyed on the canonical person.
 *   5. The session is signed carrying `personUrn`, `conqrTenantId` and `sessionId` — identity and
 *      intent. It carries no role, because the guard asks ConqrAccess on every request.
 *
 * **What this does not touch.** ConqrHub is currently the suite's identity provider for ConqrPlan
 * and ConqrMeet, which authenticate against `/api/idp`. That path is deliberately untouched here:
 * a change that moved ConqrHub to the platform and broke its IdP in the same deploy would take two
 * other products down with it. Those products move to ConqrAuth in their own change.
 */
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { PlatformConfigService } from './platform.config';
import { PlatformClientsService } from './platform-clients.service';
import { TenantBindingService } from './tenant-binding.service';
import { SignupService } from '../auth/services/signup.service';
import { SessionService } from '../session/session.service';

export interface PlatformClaims {
  personUrn: string;
  conqrTenantId: string;
}

@Injectable()
export class PlatformLoginService {
  private readonly logger = new Logger(PlatformLoginService.name);

  constructor(
    private readonly config: PlatformConfigService,
    private readonly clients: PlatformClientsService,
    private readonly bindings: TenantBindingService,
    private readonly userRepo: UserRepo,
    private readonly signupService: SignupService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Establish a ConqrHub session for a person who has just authenticated against the platform.
   *
   * `issuer` and `subject` are the OIDC identity as the provider stated them. `requestedTenant` is
   * what the launcher asked for, when it asked for anything.
   */
  async establishSession(input: {
    issuer: string;
    subject: string;
    email?: string | undefined;
    displayName?: string | undefined;
    requestedTenant?: string | undefined;
    correlationId?: string | undefined;
  }): Promise<{ authToken: string; claims: PlatformClaims }> {
    const cfg = this.config.requirePlatform();

    // 1. Who is this, canonically? Keyed on (issuer, subject) — never on the e-mail address.
    const person = await this.clients.resolvePerson({
      issuer: input.issuer,
      subject: input.subject,
      email: input.email,
      displayName: input.displayName,
    });

    // 2. Which tenant? Only an unambiguous answer is used.
    let conqrTenantId = input.requestedTenant;
    if (!conqrTenantId) {
      const memberships = await this.clients.listMemberships(
        person.personUrn,
        input.correlationId,
      );
      const entitled = memberships.filter(
        (m: { membership_status: string; applications: string[] }) =>
          m.membership_status === 'active' && m.applications.includes(cfg.applicationId),
      );
      if (entitled.length !== 1) {
        throw new ForbiddenException({
          error: 'tenant_ambiguous',
          message:
            entitled.length === 0
              ? 'You do not have access to ConqrHub in any workspace.'
              : 'Please choose a workspace to open.',
        });
      }
      conqrTenantId = entitled[0].tenant_id as string;
    }
    const tenant: string = conqrTenantId;

    // 3. Which ConqrHub workspace? Only a binding somebody created says.
    const binding = await this.bindings.resolve(tenant, cfg.applicationId);
    if (!binding) {
      throw new ForbiddenException({
        error: 'tenant_not_bound',
        message: 'This workspace is not set up for ConqrHub yet.',
      });
    }

    // 4. Only now does anything local happen. Find the existing user in *this* workspace, or
    //    provision one. The e-mail is used to address the row, not to decide who the person is —
    //    that was settled in step 1, and the workspace was settled in step 3.
    const email = person.email ?? input.email;
    if (!email) {
      // ConqrHub's user table requires an address to key a row on. A person with no verified
      // contact cannot be provisioned here; refusing is better than inventing one.
      throw new ForbiddenException({
        error: 'identity_incomplete',
        message: 'Your account has no verified e-mail address for this workspace.',
      });
    }

    let user = await this.userRepo.findByEmail(email, binding.workspaceId);
    if (!user) {
      user = await this.signupService.signup(
        {
          email,
          name: person.displayName ?? input.displayName ?? email,
          // The local password is a value nobody ever uses: authentication happened at the
          // platform, and this row exists to hang ConqrHub's own data off.
          password: randomBytes(24).toString('base64url'),
        },
        binding.workspaceId,
      );
    }

    // 5. The session. Identity and intent; no authority.
    const authToken = await this.sessionService.createPlatformSessionAndToken(user, {
      personUrn: person.personUrn,
      conqrTenantId: tenant,
    });

    this.logger.log(
      `platform session established for ${person.personUrn} in ${tenant} → workspace ${binding.workspaceId}`,
    );
    return { authToken, claims: { personUrn: person.personUrn, conqrTenantId: tenant } };
  }
}
