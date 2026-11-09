/**
 * The browser origins allowed to make credentialed requests to the Hub:
 * APP_URL's origin, the exact entries of CORS_ALLOWED_ORIGINS (sibling suite
 * products, never a wildcard) and, when SUBDOMAIN_HOST is set, its
 * subdomains. Shared by CORS, CSRF protection and the WebSocket handshake so
 * the three can never disagree about who is trusted.
 */
export interface AllowedOrigins {
  /** APP_URL's origin, or null when APP_URL is missing or unparseable. */
  appOrigin: string | null;
  isAllowed(origin: string): boolean;
}

export function allowedOriginsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AllowedOrigins {
  let appOrigin: string | null = null;
  if (env.APP_URL) {
    try {
      appOrigin = new URL(env.APP_URL).origin;
    } catch {
      appOrigin = null;
    }
  }
  const extra = (env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const subdomainHost = env.SUBDOMAIN_HOST;

  return {
    appOrigin,
    isAllowed(origin: string): boolean {
      if (!origin) return false;
      if (appOrigin && origin === appOrigin) return true;
      if (extra.includes(origin)) return true;
      if (subdomainHost) {
        try {
          const host = new URL(origin).host;
          if (host === subdomainHost || host.endsWith('.' + subdomainHost)) {
            return true;
          }
        } catch {
          return false;
        }
      }
      return false;
    },
  };
}

/** `scheme://host[:port]` of a URL, or null. */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin === 'null' ? null : parsed.origin;
  } catch {
    return null;
  }
}
