# Security Policy

## Supported Versions

Security fixes are applied to the latest `main` branch.

## Reporting a Vulnerability

Please do not open public issues for suspected security vulnerabilities.

Report privately via:
- GitHub Security Advisory (preferred)
- Direct maintainer contact listed in repository profile

Include:
- Affected component/file
- Reproduction steps or proof of concept
- Impact assessment
- Suggested remediation (if available)

We will acknowledge receipt as quickly as possible and coordinate a responsible disclosure timeline.

## Sensitive Data Handling

- Never commit `.env`, credentials, tokens, private keys, or production database files.
- Use placeholders in docs (`YOUR_TOKEN`, `YOUR_DOMAIN`, `YOUR_SERVER_IP`).
- Rotate credentials immediately if exposure is suspected.
