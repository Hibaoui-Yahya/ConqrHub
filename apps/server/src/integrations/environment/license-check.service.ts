import { Injectable } from '@nestjs/common';
import { EnvironmentService } from './environment.service';

const ALL_FEATURES = [
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

@Injectable()
export class LicenseCheckService {
  constructor(private environmentService: EnvironmentService) {}

  isValidEELicense(_licenseKey: string): boolean {
    return true;
  }

  hasFeature(_licenseKey: string, _feature: string, _plan?: string): boolean {
    return true;
  }

  getFeatures(_licenseKey: string): string[] {
    return [...ALL_FEATURES];
  }

  resolveFeatures(_licenseKey: string, _plan: string): string[] {
    return [...ALL_FEATURES];
  }

  resolveTier(_licenseKey: string, _plan: string): string {
    return 'enterprise';
  }
}
