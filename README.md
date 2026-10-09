# Ramble

**Your personal explore map. Works with zero bars.**

Ramble remembers the places you love, levels them up each time you return, nudges you outside, and turns your walks into a private journal. The AI, **Gemma**, runs **on your phone**, so it works on a trail with no signal. When you're online, Ramble gets smarter, and if you create an account it syncs across your devices, **end-to-end encrypted**.

Built for the [DEV Hacktoberfest Open-Source AI Challenge, Week 1 ("Touch Grass")](https://dev.to/challenges/hacktoberfest-week1-2026-10-05).

> 🚧 In active development, October 2026.

## Docs
- [Architecture](docs/ARCHITECTURE.md): system design, stack, data model, AI pipeline, offline strategy
- [Security & privacy](docs/SECURITY.md): threat model, encryption design, controls, residual risks
- [Hacktoberfest plan](docs/hacktoberfest-guide.md): prizes, timeline, the post

## Repo layout
```
apps/web        the PWA (React, Vite, MapLibre, on-device Gemma)
apps/api        the backend (Hono on Node), which also serves the built PWA
packages/shared Zod schemas shared by both
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

**Gemma device test:** open `/spike.html` on the device you want to check. It reports WebGPU support, downloads the model (one-time, hash-verified), and measures speed.

## Tests
```bash
npm test
npm run typecheck
```

## Credits
Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors · tiles by [OpenFreeMap](https://openfreemap.org) · [MapLibre](https://maplibre.org) · [Gemma](https://ai.google.dev/gemma) via [LiteRT-LM](https://ai.google.dev/edge/litert-lm) and [Transformers.js](https://huggingface.co/docs/transformers.js).

## Licence
[MIT](LICENSE)
