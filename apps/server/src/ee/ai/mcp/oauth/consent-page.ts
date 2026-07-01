/**
 * Self-contained, server-rendered OAuth consent page. No client bundle, no
 * external assets (CSP-safe). All dynamic values are HTML-escaped.
 */

function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ConsentPageParams {
  clientName: string;
  userEmail: string;
  workspaceName: string;
  scopes: string[];
  // Hidden fields echoed back on POST /oauth/authorize/consent.
  hidden: Record<string, string>;
}

const SCOPE_LABELS: Record<string, string> = {
  mcp: 'Read and write your workspace content (pages, spaces, comments) on your behalf',
  offline_access: 'Stay connected without asking you to sign in again',
};

export function renderConsentPage(params: ConsentPageParams): string {
  const hiddenInputs = Object.entries(params.hidden)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${esc(k)}" value="${esc(v ?? '')}" />`,
    )
    .join('\n      ');

  const scopeItems = params.scopes
    .map(
      (s) =>
        `<li><span class="scope-name">${esc(s)}</span><span class="scope-desc">${esc(
          SCOPE_LABELS[s] ?? 'Access granted to the connected application',
        )}</span></li>`,
    )
    .join('\n        ');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Authorize ${esc(params.clientName)} — ConqrHub</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center;
      justify-content: center; padding: 24px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0b0d12; color: #e7e9ee;
    }
    .card {
      width: 100%; max-width: 440px; background: #151821;
      border: 1px solid #262b36; border-radius: 16px; padding: 32px;
      box-shadow: 0 12px 40px rgba(0,0,0,.4);
    }
    .brand { font-size: 13px; letter-spacing: .08em; text-transform: uppercase;
      color: #8b93a7; margin: 0 0 20px; }
    h1 { font-size: 20px; line-height: 1.35; margin: 0 0 8px; font-weight: 650; }
    .sub { font-size: 14px; color: #9aa3b6; margin: 0 0 24px; }
    .who { font-size: 13px; color: #9aa3b6; margin: 0 0 20px;
      padding: 12px 14px; background: #10131a; border-radius: 10px;
      border: 1px solid #222735; }
    .who strong { color: #e7e9ee; font-weight: 600; }
    ul.scopes { list-style: none; margin: 0 0 28px; padding: 0; }
    ul.scopes li { display: flex; flex-direction: column; gap: 2px;
      padding: 12px 0; border-top: 1px solid #222735; }
    ul.scopes li:last-child { border-bottom: 1px solid #222735; }
    .scope-name { font-size: 13px; font-weight: 600; color: #cfd5e3; }
    .scope-desc { font-size: 13px; color: #8b93a7; }
    .actions { display: flex; gap: 12px; }
    button { flex: 1; padding: 12px 16px; border-radius: 10px; font-size: 14px;
      font-weight: 600; cursor: pointer; border: 1px solid transparent; }
    .approve { background: #3b82f6; color: #fff; }
    .approve:hover { background: #2f6fe0; }
    .deny { background: transparent; color: #cfd5e3; border-color: #333a49; }
    .deny:hover { background: #1b1f2a; }
    .warn { font-size: 12px; color: #8b93a7; margin: 20px 0 0; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <p class="brand">ConqrHub</p>
    <h1>Authorize <strong>${esc(params.clientName)}</strong></h1>
    <p class="sub">This application is requesting access to your ConqrHub workspace via MCP.</p>
    <p class="who">Signed in as <strong>${esc(params.userEmail)}</strong> · workspace <strong>${esc(params.workspaceName)}</strong></p>
    <ul class="scopes">
        ${scopeItems}
    </ul>
    <form method="POST" action="/oauth/authorize/consent">
      ${hiddenInputs}
      <div class="actions">
        <button class="deny" type="submit" name="decision" value="deny">Deny</button>
        <button class="approve" type="submit" name="decision" value="approve">Allow access</button>
      </div>
    </form>
    <p class="warn">Only allow access if you trust this application. You can revoke it any time from Account Settings → API Keys.</p>
  </div>
</body>
</html>`;
}
