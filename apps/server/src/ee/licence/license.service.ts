import { Injectable } from '@nestjs/common';

/**
 * Self-hosted license service.
 *
 * In self-hosted deployments, all features are available.
 * The license key is validated by the Entitlements system,
 * but feature access is unrestricted for ConqrHub.
 */
@Injectable()
export class LicenseService {
  private readonly ALL_FEATURES = [
    'sso:google',
    'sso:custom',
    'mfa',
    'api:keys',
    'comment:resolution',
    'page:permissions',
    'ai',
    'mcp',
    'import:confluence',
    'import:docx',
    'attachment:indexing',
    'security:settings',
    'scim',
    'page:verification',
    'audit:logs',
    'retention',
    'sharing:controls',
    'templates',
    'comment:viewer',
  ];

  isValidEELicense(_licenseKey: string): boolean {
    return true;
  }

  hasFeature(_licenseKey: string, _feature: string): boolean {
    return true;
  }

  getFeatures(_licenseKey: string): string[] {
    return [...this.ALL_FEATURES];
  }

  getLicenseType(_licenseKey: string): string {
    return 'enterprise';
  }
}
