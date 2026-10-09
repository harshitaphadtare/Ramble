# Ramble

**Your personal explore map. Works with zero bars.**

Ramble remembers the places you love, levels them up each time you return, nudges you outside, and turns your walks into a private journal. There's **nothing to install**: it opens like a website and keeps working on a trail with no signal. When you're online, open-weight **Gemma** picks your next walk and polishes journal entries on request, and if you create an account Ramble syncs across your devices, **end-to-end encrypted**.

**Live:** https://ramble-gw4t.onrender.com · Built for the [DEV Hacktoberfest Open-Source AI Challenge, Week 1 ("Touch Grass")](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

## What it does
- **Get me outside:** pick time, mood and energy. Ramble finds real parks, gardens, lookouts and beaches nearby (OpenStreetMap), shows instant picks, then **Gemma** refines them with reasons.
- **Walk here:** footpath route, live distance left, arrival → check in. Location is only tracked during a walk.
- **Check in & level up:** Want to go → Visited → Favourite → Regular → Local legend, with a celebration.
- **Journal:** a note (type or dictate) and a photo per visit; **✨ Polish** sends that one note to Gemma, only when you tap it.
- **You:** touched-grass streak, places by level, journal timeline, delete all data.
- **Optional partners** (each switches on when its key is set): trail & park updates (**SerpApi**), places you'll love (**TabPFN**, opt-in), encrypted sync (**MongoDB Atlas**), tracing (**Sentry**).

## Privacy & security in one paragraph
Everything you create is encrypted on your device (AES-GCM-256, keys held in WebCrypto). Sync is zero-knowledge: your password is turned into keys on the device with Argon2id, the server only ever stores ciphertext and wrapped keys, and a recovery key you keep is the only way back if you forget your password. Strict CSP, no third-party scripts, photo metadata stripped, AI output treated as untrusted. Details: [docs/SECURITY.md](docs/SECURITY.md).

## Docs
- [Architecture](docs/ARCHITECTURE.md): design, stack, data model, AI pipeline, and an **As built** table of what shipped
- [Security & privacy](docs/SECURITY.md): threat model, encryption, controls, residual risks, checklist
- [Hacktoberfest plan](docs/hacktoberfest-guide.md): prizes, timeline, the post

## Repo layout
```
apps/web        the PWA (React, Vite, MapLibre, Dexie, WebCrypto)
apps/api        the backend (Hono on Node): serves the PWA, Gemma, Overpass, SerpApi, TabPFN, accounts
packages/shared Zod schemas, domain model, rule ranker, Overpass query: shared by both
scripts/smoke   live smoke test against the deployed site
docs/           architecture, security, plan
```

## Run it locally
Requires Node 22+.

```bash
npm ci
cp .env.example .env.local      # fill in only what you need; never commit it
npm run dev                     # PWA on http://localhost:5173 (proxies /api)
npm run dev:api                 # API on http://localhost:8787
```

Production-like (strict CSP and headers, like on Render):
```bash
npm run build && npm start      # http://localhost:8787
```

With accounts and sync, but no MongoDB needed (everything is in memory):
```bash
npm run build && npm run dev:accounts   # http://localhost:8788
```

## Configuration
Every key is optional. Ramble works with none of them; each one switches on a feature (see `GET /api/features`).

| Variable | Turns on |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` | Gemma (suggestions, ✨ Polish, update summaries) |
| `SERPAPI_KEY` | Trail & park updates |
| `TABPFN_API_KEY` | Places you'll love (users still opt in) |
| `MONGODB_URI`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Accounts + encrypted sync |
| `RESEND_API_KEY` (+ optional `RESEND_FROM`) | Email verification for accounts |
| `SENTRY_DSN`, `VITE_SENTRY_DSN` | Tracing (server / browser; the browser one is read at build time) |

## Checks
```bash
npm run check   # typecheck, lint, tests, build (CI runs the same on every push)
npm run smoke   # checks the live site like a user would
```

## Credits
Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors via [Overpass](https://overpass-api.de) · tiles by [OpenFreeMap](https://openfreemap.org) · [MapLibre](https://maplibre.org) · routes by [OSRM](https://project-osrm.org) on the [FOSSGIS](https://routing.openstreetmap.de) server · [Gemma](https://ai.google.dev/gemma) on [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/) · [TabPFN](https://priorlabs.ai) · [SerpApi](https://serpapi.com) · [Better Auth](https://better-auth.com) · Ramble's ideas grew out of my earlier project [Wander](https://github.com/harshitaphadtare/Wander); this is a new build for the challenge.

## Licence
[MIT](LICENSE)
