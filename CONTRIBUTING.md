     1|# Contributing
     2|
     3|Thanks for your interest in contributing.
     4|
     5|## Development Setup
     6|
     7|```bash
     8|git clone https://github.com/Vlad-PLK/la citadel.git
     9|cd la citadel
    10|npm install
    11|cp .env.example .env.local
    12|npm run dev
    13|```
    14|
    15|## Before Opening a PR
    16|
    17|Run:
    18|
    19|```bash
    20|npm run lint
    21|npx tsc --noEmit
    22|```
    23|
    24|If you change runtime behavior, include:
    25|- verification steps
    26|- screenshots/log snippets when relevant
    27|- migration notes if DB/API contracts changed
    28|
    29|## Security
    30|
    31|Do not include secrets, tokens, server IPs, or internal hostnames in commits, docs, or PR descriptions.
    32|Refer to `SECURITY.md` for vulnerability reporting.
    33|