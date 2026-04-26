# Air-gapped deployment

For environments with no outbound internet — regulated industries, sovereign clouds, classified networks. **Business and Enterprise tiers** are designed to support this.

## What "air-gapped" means here

- No outbound internet access from the server.
- No telemetry leaving the network.
- No external SaaS dependencies (Stripe, OpenAI, Postmark) in the request path.
- License validation works **offline**.

## What still works

| Capability | How |
|---|---|
| Authentication (email/password, SSO) | Local — SAML/OIDC/LDAP IdPs are inside the network |
| Real-time collaboration | Local Postgres + Redis |
| Search (Postgres FTS) | Local |
| Search (Typesense) | Local Typesense instance |
| Email | Internal SMTP relay |
| AI features | Local Ollama or local OpenAI-compatible endpoint |
| PDF export | Local Gotenberg |
| Storage | Local disk, on-prem S3-compatible (MinIO), Azure Stack |
| Audit logs, retention, verification | Fully local |
| License activation | Offline — license keys are signed; verification doesn't need a server |
| Updates | Pull new image into your registry, deploy |

## What you must replace

| Outbound dep | Replacement |
|---|---|
| OpenAI / Gemini cloud APIs | **Ollama** (recommended) or self-hosted vLLM / TGI / LiteLLM exposing an OpenAI-compatible endpoint |
| Postmark | Internal SMTP server (Exchange, Postfix, sendgrid-relay…) |
| Public Draw.io | Self-hosted Draw.io server (`DRAWIO_URL` env var) |
| External CDNs | Bundle assets in the image; the SPA build is fully self-contained |
| `npm install` at build time | Build the image in a connected zone, ship the image into the air-gapped network |

## Environment variables

Set:

- `DISABLE_TELEMETRY=true`
- `OLLAMA_API_URL=http://ollama.internal:11434` (or `OPENAI_API_URL` to a local LiteLLM)
- `MAIL_DRIVER=smtp` with internal SMTP host
- `STORAGE_DRIVER=local` (single instance) or `s3` pointing at MinIO
- `DRAWIO_URL=https://drawio.internal/`

Do not set Stripe variables — air-gapped deployments are always self-hosted, license-key-based.

## License validation

License keys are signed (asymmetric). The server validates the signature using `LICENSE_PUBLIC_KEY` — no network required. The signature includes:

- Customer name / org
- Seat count
- License type (Business / Enterprise)
- Issue and expiry dates
- Feature set
- Trial flag

When a key expires, the workspace falls back to free tier. Renewal: get a new key from your account contact, paste it into Settings → License & Edition.

## AI in air-gapped mode

The recommended setup:

```
[Server] ──► OLLAMA_API_URL=http://ollama.internal:11434
                                                   │
                                                   ▼
                                  [Ollama, running e.g. llama-3.1, mxbai-embed-large]
```

Ollama supports both **chat models** and **embedding models**, which means it can power AI Chat, AI Search, and AI Assistant. Performance depends on your hardware — consult the Ollama docs for sizing.

For organizations standardized on a different runtime (vLLM, TGI), expose an **OpenAI-compatible** endpoint via LiteLLM and set `OPENAI_API_URL`.

## Updates

- **Image distribution.** Build images in a connected build environment. Push to your air-gapped registry.
- **Migrations.** New images run migrations on boot.
- **License renewal.** New keys delivered out-of-band (USB stick, signed email, internal portal).

## Hardening checklist

- [ ] Outbound firewall rules deny everything except the SMTP / IdP / AI relays you've explicitly approved.
- [ ] `DISABLE_TELEMETRY=true` is set.
- [ ] No third-party CDN URLs in served HTML — verify by inspecting `index.html`.
- [ ] Public-share pages (if used internally) honor your DLP policies.
- [ ] Audit-log retention is configured.
- [ ] License key public key is deployed and valid.

## Related

- Self-hosted general: [`./self-hosted.md`](./self-hosted.md)
- AI provider configuration: [`../admin/ai-governance.md`](../admin/ai-governance.md)
- License activation UX: [`../admin/billing-and-license.md`](../admin/billing-and-license.md)
- Architecture context: [`../architecture/enterprise-edition.md`](../architecture/enterprise-edition.md)
