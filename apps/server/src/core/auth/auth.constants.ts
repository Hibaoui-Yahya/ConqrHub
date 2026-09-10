export enum UserTokenType {
  FORGOT_PASSWORD = 'forgot-password',
  EMAIL_VERIFICATION = 'email-verification',
}

/**
 * Request-scoped markers a route guard may set on the raw request BEFORE
 * Passport runs. An audience-bound api_key token (one carrying `aud`, e.g. an
 * MCP OAuth access token) is accepted by JwtStrategy only when the route
 * declared the matching expected audience, and only if the token's scope
 * contains the route's required scope. Routes that declare nothing reject
 * every audience-bound token before any lookup (F27).
 */
export const EXPECTED_TOKEN_AUDIENCE_KEY = 'conqrExpectedTokenAudience';
export const REQUIRED_TOKEN_SCOPE_KEY = 'conqrRequiredTokenScope';
