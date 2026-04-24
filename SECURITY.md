# Security Policy

## Supported Versions

Security fixes are applied to the latest `main` branch.

## Reporting a Vulnerability

Please do not open public issues for suspected vulnerabilities.

Report privately via:
- GitHub Security Advisory (preferred)
- Direct maintainer contact listed in repository profile

Include:
- affected component/file,
- reproduction steps or proof of concept,
- impact assessment,
- suggested remediation (if available).

We acknowledge reports quickly and coordinate a responsible disclosure timeline.

---

## Baseline Security Controls (La Citadel)

La Citadel ships with these baseline controls:

- API auth gate via `MC_API_TOKEN` (middleware-level)
- Demo mode read-only blocking for mutating API methods
- Request validation with Zod on API boundaries
- Path traversal controls on file endpoints
- Approval governance on sensitive task transitions (`review -> done`)
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`)

---

## Secure Configuration Requirements

For production deployments:

1. Set `MC_API_TOKEN` to a long random value.
2. Set `WEBHOOK_SECRET` for signed callback verification.
3. Keep `OPENCLAW_GATEWAY_TOKEN` private and rotated when compromised.
4. Restrict network exposure of internal-only endpoints where possible.
5. Run behind TLS termination (reverse proxy or ingress).

Recommended secret generation:

```bash
openssl rand -hex 32
```

---

## Dependency Risk Management

Use:

```bash
npm audit
```

Policy:
- Apply non-breaking security updates promptly.
- For major-version security upgrades, run compatibility validation (`npm run lint`, `npm run build`) before rollout.
- Track unresolved advisories and document compensating controls.

---

## Sensitive Data Handling

- Never commit `.env`, credentials, tokens, private keys, or production database files.
- Use placeholders in docs (`YOUR_TOKEN`, `YOUR_DOMAIN`, `YOUR_SERVER_IP`).
- Rotate credentials immediately if exposure is suspected.
