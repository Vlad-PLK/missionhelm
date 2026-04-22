# Contributing

Thanks for your interest in contributing.

## Development Setup

```bash
git clone https://github.com/Vlad-PLK/missionhelm.git
cd missionhelm
npm install
cp .env.example .env.local
npm run dev
```

## Before Opening a PR

Run:

```bash
npm run lint
npx tsc --noEmit
```

If you change runtime behavior, include:
- verification steps
- screenshots/log snippets when relevant
- migration notes if DB/API contracts changed

## Security

Do not include secrets, tokens, server IPs, or internal hostnames in commits, docs, or PR descriptions.
Refer to `SECURITY.md` for vulnerability reporting.
