/**
 * ConqrHub — Conqr platform integration.
 *
 * Ported from the ConqrService canary unchanged apart from the product it names. That it needed no
 * adaptation is the point: the configuration contract is the platform's, not each product's.
 *
 * Which authentication and authorization mode this deployment runs in, and the configuration each
 * one needs.
 *
 * There are exactly two modes and they are chosen by configuration, not by what happens to be
 * reachable at runtime:
 *
 *   **standalone** — the product's own OIDC relying-party login against whatever identity provider
 *   the operator configured, its own tenant resolution, its own roles. This is what ConqrHub
 *   was before the platform existed and it keeps working unchanged.
 *
 *   **platform** — ConqrAuth authenticates, ConqrIdentity says who the person canonically is, and
 *   ConqrAccess decides the active tenant, the membership, the roles and the application
 *   entitlement. The product decides nothing about authorization on its own.
 *
 * **Platform mode fails closed on missing configuration.** If `CONQR_PLATFORM_MODE=platform` and
 * any required value is absent, the application refuses to start. It does not fall back to
 * standalone: a deployment that believes it is enforcing platform authorization while actually
 * running the product's own is the worst of the three possible states, and it is the one a silent
 * fallback produces.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AuthMode = 'standalone' | 'platform';

export interface PlatformConfig {
  /** Where ConqrAccess lives. Private network in the lab; never a public data-tier route. */
  accessBaseUrl: string;
  /** Where ConqrIdentity lives. */
  identityBaseUrl: string;
  /** This product's own service identity. Narrow by construction: it is not ConqrAuth's. */
  serviceUrn: string;
  /** Ed25519 private key for the service assertion, PEM. Only ever from a secret. */
  servicePrivateKeyPem: string;
  serviceKeyId: string;
  /** The Conqr application id this deployment is installed as. */
  applicationId: string;
  /** Redis holding the revision watermark, so a revocation is seen before the context expires. */
  revisionRedisUrl?: string;
}

@Injectable()
export class PlatformConfigService {
  private readonly logger = new Logger(PlatformConfigService.name);
  private readonly mode: AuthMode;
  private readonly config?: PlatformConfig;

  constructor(private readonly cfg: ConfigService) {
    const declared = (this.cfg.get<string>('CONQR_PLATFORM_MODE') ?? 'standalone').trim();
    if (declared !== 'standalone' && declared !== 'platform') {
      throw new Error(
        `CONQR_PLATFORM_MODE must be 'standalone' or 'platform', got '${declared}'`,
      );
    }
    this.mode = declared;
    if (this.mode === 'standalone') {
      this.logger.log('auth mode: standalone (the platform is not consulted)');
      return;
    }

    // Fail closed, and say which values are missing — all of them, named as the variables an
    // operator actually has to set. An error that says "applicationId" sends somebody looking
    // through source code for the variable that produces it.
    const required = {
      accessBaseUrl: this.cfg.get<string>('CONQR_ACCESS_URL'),
      identityBaseUrl: this.cfg.get<string>('CONQR_IDENTITY_URL'),
      serviceUrn: this.cfg.get<string>('CONQR_SERVICE_URN'),
      servicePrivateKeyPem: this.cfg.get<string>('CONQR_SERVICE_PRIVATE_KEY'),
      serviceKeyId: this.cfg.get<string>('CONQR_SERVICE_KEY_ID'),
      applicationId: this.cfg.get<string>('CONQR_APPLICATION_ID'),
    };
    const VARIABLE: Record<keyof typeof required, string> = {
      accessBaseUrl: 'CONQR_ACCESS_URL',
      identityBaseUrl: 'CONQR_IDENTITY_URL',
      serviceUrn: 'CONQR_SERVICE_URN',
      servicePrivateKeyPem: 'CONQR_SERVICE_PRIVATE_KEY',
      serviceKeyId: 'CONQR_SERVICE_KEY_ID',
      applicationId: 'CONQR_APPLICATION_ID',
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value)
      .map(([name]) => `${VARIABLE[name as keyof typeof required]} (${name})`);
    if (missing.length) {
      throw new Error(
        `platform mode is enabled but required configuration is missing: ${missing.join(', ')}. ` +
          'Refusing to start: falling back to standalone here would mean enforcing the ' +
          "product's own authorization while believing the platform's was in force.",
      );
    }

    this.config = {
      accessBaseUrl: required.accessBaseUrl!.replace(/\/+$/, ''),
      identityBaseUrl: required.identityBaseUrl!.replace(/\/+$/, ''),
      serviceUrn: required.serviceUrn!,
      // Railway secrets arrive with literal \n in them more often than not.
      servicePrivateKeyPem: required.servicePrivateKeyPem!.replace(/\\n/g, '\n'),
      serviceKeyId: required.serviceKeyId!,
      applicationId: required.applicationId!,
      ...(this.cfg.get<string>('CONQR_REVISION_REDIS_URL')
        ? { revisionRedisUrl: this.cfg.get<string>('CONQR_REVISION_REDIS_URL') }
        : {}),
    };

    // The URN and the application id are safe to log; the key is never touched again outside the
    // signer.
    this.logger.log(
      `auth mode: platform (as ${this.config.serviceUrn}, application ${this.config.applicationId})`,
    );
    if (!this.config.revisionRedisUrl) {
      // Not fatal — the system is correct without it, just slower to invalidate — but silence here
      // would mean nobody knows why a revocation took a minute.
      this.logger.warn(
        'CONQR_REVISION_REDIS_URL is not set: revocations will not be seen until the tenant ' +
          'context expires (bounded by its 60-second lifetime), rather than on the next request',
      );
    }
  }

  getMode(): AuthMode {
    return this.mode;
  }

  isPlatformMode(): boolean {
    return this.mode === 'platform';
  }

  /** The platform configuration. Throws in standalone mode — callers must check the mode first. */
  requirePlatform(): PlatformConfig {
    if (!this.config) {
      throw new Error('platform configuration requested while running in standalone mode');
    }
    return this.config;
  }
}
