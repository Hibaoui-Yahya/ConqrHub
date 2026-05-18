/**
 * Phase 4 feature registry for cloud plans.
 *
 * Each plan maps to a set of feature flags that the entitlement system
 * resolves at runtime. Adding a feature here makes it available for
 * that plan — no license-key changes needed.
 */
const CLOUD_PLAN_FEATURES: Record<string, Set<string>> = {
  standard: new Set([
    'sso:google',
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
  ]),
  enterprise: new Set([
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
  ]),
};

/**
 * Returns the Set of feature flags for a given cloud plan.
 * Unknown plans fall back to the standard set.
 */
export function getFeaturesForCloudPlan(plan: string): Set<string> {
  const normalized = (plan ?? 'standard').toLowerCase();
  return CLOUD_PLAN_FEATURES[normalized] ?? CLOUD_PLAN_FEATURES.standard;
}
