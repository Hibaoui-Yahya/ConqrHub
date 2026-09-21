import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AuthAccountRepo } from '@docmost/db/repos/auth/auth-account.repo';
import { MappedOidcUser } from './oidc.util';
import type { User } from '@docmost/db/types/entity.types';

/**
 * Just-in-time provisioning, narrowed to the one call this service makes.
 *
 * `SignupService` is injected by token rather than imported, following the
 * `PAGE_LOCATOR` precedent in the integration module: importing it drags in
 * the workspace and space services, and through them a `src/…`-absolute
 * import that resolves at build time and not under jest. The consequence was
 * that the identity decision could not be unit-tested at all, which is
 * precisely the thing that most needs testing here.
 */
export const USER_PROVISIONER = Symbol('USER_PROVISIONER');

export interface UserProvisioner {
  signup(
    dto: { email: string; name: string; password: string },
    workspaceId: string,
  ): Promise<User>;
}

/**
 * Which ConqrHub user an IdP subject is.
 *
 * Separate from `OidcAuthService` for the reason `oidc.util.ts` gives about
 * itself: the network flow and the identity decision are different problems,
 * and only one of them can be tested without a live IdP. Keeping this here
 * also means it is reusable by any other login that federates to the same
 * provider, which is the point of a shared suite identity.
 *
 * Subject first, email only as a fallback, and the difference is the whole
 * reason this exists. The `sub` claim is immutable for the life of the account
 * at the provider; an email address is not — it can be changed, released and
 * reassigned. Matching on email means whoever can set an address at the IdP
 * can choose which ConqrHub user they become, and because each product would
 * resolve that address independently, the choice propagates across the suite.
 * Matching on the subject removes the choice.
 *
 * The email path survives because an existing workspace full of people who
 * predate SSO has to be adoptable: their first sign-in matches on address and
 * *writes the link*, so it is the last time the address decides anything for
 * them. A subject that already resolves never consults the address again,
 * which is what makes an address changed at the IdP afterwards a profile
 * change rather than a different person.
 */
@Injectable()
export class OidcIdentityLinkService {
  constructor(
    private readonly env: EnvironmentService,
    private readonly userRepo: UserRepo,
    private readonly authAccountRepo: AuthAccountRepo,
    @Inject(USER_PROVISIONER) private readonly provisioner: UserProvisioner,
  ) {}

  async resolveUser(
    mapped: MappedOidcUser,
    workspaceId: string,
  ): Promise<User> {
    const idpKey = this.env.getSuiteIdpKey();

    if (idpKey) {
      const account = await this.authAccountRepo.findByProviderSubject(
        idpKey,
        mapped.sub,
        workspaceId,
      );
      if (account) {
        const linked = await this.userRepo.findById(account.userId, workspaceId);
        // A link pointing at a user who is gone is a broken mapping, not an
        // invitation to try the email path — falling back is how a
        // deleted-and-recreated account quietly becomes somebody else.
        if (!linked) {
          throw new UnauthorizedException(
            'This identity is linked to an account that no longer exists',
          );
        }
        await this.link(linked.id, workspaceId, idpKey, mapped.sub);
        return linked;
      }
    }

    let user = await this.userRepo.findByEmail(mapped.email, workspaceId);
    if (!user) {
      // Just-in-time provisioning (§9.1). OIDC users authenticate via the IdP;
      // the local password is a random value they never use.
      user = await this.provisioner.signup(
        {
          email: mapped.email,
          name: mapped.name,
          password: randomBytes(24).toString('base64url'),
        },
        workspaceId,
      );
    }

    if (idpKey) {
      await this.link(user.id, workspaceId, idpKey, mapped.sub);
    }

    return user;
  }

  /**
   * Written on every login rather than only on the first. It is a cheap
   * upsert, and it means a deployment that turns the shared IdP on acquires
   * its links as people arrive, with no backfill and no guessing.
   */
  private link(
    userId: string,
    workspaceId: string,
    idpKey: string,
    providerUserId: string,
  ): Promise<void> {
    return this.authAccountRepo.link({
      userId,
      workspaceId,
      idpKey,
      providerUserId,
    });
  }
}
