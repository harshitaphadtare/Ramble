# Ramble: System Design & Architecture

> Ramble is an **offline-first, online-enhanced** personal explore map. It remembers the places you love, levels them up each time you return, nudges you outside, and turns your walks into a private journal.
> **Nothing to download:** it opens like any website. The map, your places, check-ins, walks and journal work with zero bars. When you're online, the AI joins in: **Gemma** (open-weight, hosted on Cloudflare Workers AI and called through our server) picks walks and polishes journal entries, **TabPFN** predicts places you'll love, **SerpApi** checks for trail closures, and an optional account gives you **end-to-end-encrypted** backup and sync (**MongoDB Atlas**).
>
> Companion docs: [SECURITY.md](SECURITY.md) (threat model and security design) · [hacktoberfest-guide.md](hacktoberfest-guide.md) (challenge plan, prizes, timeline)

**Scope tags used throughout:**
- **[P1]**: core, built first
- **[P2]**: online enhancements, built second
- **[P3]**: accounts and sync, built third
- **[L]**: later, after the challenge

---

## Contents
1. [Design principles](#1-design-principles)
2. [System context](#2-system-context)
3. [High-level architecture](#3-high-level-architecture)
4. [Tech stack](#4-tech-stack)
5. [Project structure](#5-project-structure)
6. [Data model](#6-data-model)
7. [AI pipeline (Gemma on Workers AI)](#7-ai-pipeline-gemma-on-workers-ai)
8. [Personalisation (TabPFN)](#8-personalisation-tabpfn)
9. [Trail and park updates (SerpApi)](#9-trail-and-park-updates-serpapi)
10. [Accounts and end-to-end-encrypted sync (MongoDB Atlas)](#10-accounts-and-end-to-end-encrypted-sync-mongodb-atlas)
11. [Backend API](#11-backend-api)
12. [Offline and online strategy](#12-offline-and-online-strategy)
13. [Key flows](#13-key-flows)
14. [Performance design](#14-performance-design)
15. [Deployment and infrastructure](#15-deployment-and-infrastructure)
16. [Observability (Sentry)](#16-observability-sentry)
17. [Testing strategy](#17-testing-strategy)
18. [CI/CD](#18-cicd)
19. [Roadmap](#19-roadmap)
20. [Open questions to resolve first](#20-open-questions-to-resolve-first)

---

## 1. Design principles

| # | Principle | What it means in practice |
|---|---|---|
| 1 | **Nothing to download** | Ramble opens like a normal website. No app store, no model download, no setup before it's useful. |
| 2 | **Offline-first** | The phone's database is the source of truth. Map, places, check-ins, walks and journal all work with no signal. |
| 3 | **Online-enhanced** | Online features (Gemma, TabPFN, trail updates, sync) add value but **never block** anything. Offline, they show the last saved result, fall back to rules, or wait politely. |
| 4 | **Zero-knowledge server** | The server stores only **ciphertext** it can't read. Your places, visits, photos and journal are encrypted on the phone before they're synced. |
| 5 | **Account optional** | Use Ramble instantly. Sign up only to back up and sync across devices. |
| 6 | **Private by design** | Third parties receive only what a feature needs, coarsened or anonymised, always through our backend, never with identifiers. |
| 7 | **Private notes reach the AI only on request** | Suggestions send only public place names and context. A journal note goes to Gemma **only when the user taps ✨ Polish**, and the provider doesn't train on it. |
| 8 | **Secure by default** | Encryption is always on, strict CSP, every input treated as untrusted. See SECURITY.md. |
| 9 | **AI that can't make up places** | Gemma ranks and describes real places the app supplies. TabPFN only scores them. Neither can invent places or take actions. |
| 10 | **Fast on a mid-range phone** | Strict performance budgets. The app shell is served from the service worker cache. AI results arrive after the cards and never block the UI. |
| 11 | **Graceful degradation** | If the network, the AI provider or the backend is missing, the app still works, just more simply (rule-based suggestions, journal saved as typed). |
| 12 | **One origin, small surface** | The app and the API are served from the **same origin**, so there's no CORS and no third-party cookies. Few dependencies. |

---

## 2. System context

```mermaid
flowchart LR
    U((You)) --> PWA[Ramble PWA<br/>on your phone]

    subgraph Render[Render web service: one origin]
        WEB[Static app files]
        API[Ramble API<br/>Hono + Better Auth]
    end

    PWA -- app files --> WEB
    PWA -- /api/* --> API
    API -- ciphertext only --> MDB[(MongoDB Atlas)]
    API -- anonymous numeric rows --> TAB[Prior Labs<br/>TabPFN API]
    API -- public place name --> SERP[SerpApi]
    API -- auth emails --> MAIL[Resend<br/>email]
    API -- prompts: public place names + context,<br/>or a note the user chose to polish --> CF[Cloudflare Workers AI<br/>Gemma 4 26B]

    PWA -- map tiles --> OFM[OpenFreeMap]
    PWA -- outdoor places, rounded bbox --> OVP[Overpass / OSM]
    PWA -- search --> PH[Photon]
    PWA -- forecast, rounded --> OM[Open-Meteo]
    PWA -- walking route --> RT[OSRM routing]
    PWA -. metrics only .-> SE[Sentry]
    API -. metrics only .-> SE
```

**Who receives what:**

| Service | Receives | Never receives |
|---|---|---|
| **Ramble API (Render)** | Session cookie; encrypted records; anonymous feature rows; public place names to look up | Plaintext places, visits, notes, photos, the password, encryption keys |
| **MongoDB Atlas** | Ciphertext envelopes, wrapped (encrypted) keys, auth records (email, double-hashed auth key) | Any plaintext user content |
| **Prior Labs (TabPFN)** | Numeric rows such as `[kind=3, distBucket=2, hourBucket=4, …]` with labels | Names, coordinates, ids, the user's identity or IP (proxied) |
| **SerpApi** | A public place name + suburb (e.g. "Merri Creek Trail, Northcote") | Who asked (proxied, results shared across users), coordinates |
| **Resend** | The email address, for verification and password-reset emails only | Anything else |
| **Cloudflare Workers AI** | Suggestion prompts (public place names, distances, time, mood, weather); trail-update snippets; a journal note **only when the user taps ✨ Polish** | Coordinates, user identity or IP (proxied), anything automatically from the journal. Cloudflare's docs state prompts and outputs aren't used for training or stored |
| OpenFreeMap | The map tiles you view | Your data |
| Overpass | A **rounded** bounding box of about 5 km | Your exact location, your history |
| Photon | Search text + a rounded bias point | Your history |
| Open-Meteo | Lat/lon at 2 decimals (~1 km) | Anything else |
| Routing | The start and end of a route you request | Your history |
| Sentry | Timings and errors, content scrubbed | Coordinates, notes, prompts, outputs, emails |

---

## 3. High-level architecture

### 3.1 Client (on the phone)

```mermaid
flowchart TB
    subgraph Main[Main thread]
        UI[React UI<br/>tabs, sheets, map]
        Store[Zustand store<br/>decrypted in-memory view]
        Repo[Repository<br/>encrypt / decrypt / validate]
        Sync[Sync engine<br/>push / pull / merge]
        Online[Online services client<br/>Gemma, TabPFN, trail updates, auth]
        Rules[Rule-based fallback<br/>suggestions offline]
        Map[MapLibre GL]
    end
    subgraph Workers[Background threads]
        SW[Service worker: Workbox]
    end
    subgraph Storage[On-device storage]
        IDB[(IndexedDB: encrypted records)]
        Cache[(Cache API: shell, tiles)]
    end
    UI <--> Store <--> Repo <--> IDB
    Repo <--> Sync --> APIc[/api/sync]
    UI --> Online --> APIo[/api/*]
    Online -. offline / AI unavailable .-> Rules
    UI <--> Map --> SW <--> Cache
```

### 3.2 Server (Render web service)

```mermaid
flowchart TB
    REQ[HTTPS request] --> SH[Security headers + body size limits]
    SH --> RL[Rate limiter<br/>per IP + per session]
    RL --> R{Route}
    R -- /api/auth/* --> BA[Better Auth<br/>email+password, anonymous sessions]
    R -- /api/sync/* --> SY[Sync service<br/>ciphertext store]
    R -- /api/vault --> VA[Vault service<br/>wrapped keys]
    R -- /api/ai/* --> AI[Gemma service<br/>prompts, validation, fallbacks]
    R -- /api/personalize --> TP[TabPFN proxy]
    R -- /api/place-updates --> SP[SerpApi proxy + 24 h shared cache]
    R -- everything else --> ST[Static app files]
    BA & SY & VA & SP --> DB[(MongoDB Atlas)]
    AI --> CF[Cloudflare Workers AI<br/>Gemma 4 26B]
    TP --> PL[Prior Labs API]
    SP --> SA[SerpApi]
```

### 3.3 Client layers

| Layer | Responsibility | Rule |
|---|---|---|
| **UI** (`features/*`) | Screens, sheets, map layers | Never touches IndexedDB, crypto or `fetch` directly |
| **Store** | Decrypted in-memory state | The only thing the UI reads |
| **Repository** | CRUD, encryption, validation, migrations | **Only** this layer reads or writes IndexedDB |
| **Crypto** | Keys, AES-GCM, wrapping, Argon2id | Pure functions on WebCrypto + hash-wasm |
| **Sync engine** | Push and pull ciphertext, client-side last-write-wins merge | Never sees plaintext outside the repository |
| **Online client** | Typed calls to `/api/*`, timeouts, results saved for offline use | Every call has an offline fallback |
| **AI client** | Calls `/api/ai/*`, shows results as they arrive, falls back to rules when offline or on error | Never sends journal text unless the user tapped ✨ Polish |
| **Net** | One `safeFetch`: host allow-list, rounding, timeouts | All outbound traffic goes through it |
| **Geo** | Distance, spatial index, sun times, polyline | Pure, unit-tested |

---

## 4. Tech stack

All open source unless marked (SaaS). Exact versions are pinned in `package-lock.json`.

### 4.1 Client
| Concern | Tool |
|---|---|
| Language / UI / build | **TypeScript** (strict), **React 19**, **Vite** |
| Styling / animation | **Tailwind CSS v4**, **motion** |
| State | **Zustand** |
| Validation | **Zod** (shared with the server) |
| Auth client | **better-auth** client |
| Map | **MapLibre GL JS** v6 (worker served from our own origin, so no `blob:` workers), **OpenFreeMap** Liberty |
| Geo | **kdbush** + **geokdbush**, **suncalc**, polyline encoding |
| Places / search / weather / routing | **Overpass** (OSM), **Photon**, **Open-Meteo**, **OSRM** (FOSSGIS) |
| Database | **Dexie** (IndexedDB) |
| PWA | **vite-plugin-pwa** (Workbox, `injectManifest`) |
| Crypto | **WebCrypto** (AES-GCM-256, AES-KW, HKDF, SHA-256) + **hash-wasm** (Argon2id) |
| Password strength | **zxcvbn-ts** + Have I Been Pwned range API (k-anonymity: only the first 5 hash characters are sent) |
| Media | `createImageBitmap` + `OffscreenCanvas` (resize + EXIF strip), `MediaRecorder` + `AudioContext` |
| Compression | Native `CompressionStream` |

### 4.2 AI
| Concern | Tool |
|---|---|
| Model | **Gemma 4 26B A4B** (`@cf/google/gemma-4-26b-a4b-it`), open-weight, Apache-2.0 |
| Host | **Cloudflare Workers AI** (SaaS) via its REST API, called only from our server. Free allocation: 10,000 neurons/day (≈1.1 M input or ≈370 K output tokens for this model). Prompts and outputs aren't used for training or stored, per Cloudflare's docs |
| Fallback | Rule-based ranker + templated reasons (offline, provider down, or quota used up) |
| Swappable | Because the model is open-weight, the same prompts work on any Gemma host (Google Cloud Vertex AI, a GPU droplet, self-hosted). One config line changes the host |

> **Why not on the device?** We tested it: Gemma 4 E2B in the browser is a **2 GB download** before the AI works, and the 270M model that fits easily produced unusable output. Asking users to download 2 GB kills the first experience, so the model runs in the cloud instead.

### 4.3 Server
| Concern | Tool |
|---|---|
| Runtime | **Node.js 22 LTS** |
| HTTP framework | **Hono** (small, fast, typed) + `@hono/node-server` |
| Auth | **Better Auth** (email + password, email verification, password reset, **anonymous** sessions, session management) + `@better-auth/mongo-adapter` |
| Database | **MongoDB Atlas** (SaaS) via the official `mongodb` driver; **GridFS** for encrypted photo blobs |
| Validation | **Zod** (shared package) |
| Rate limiting | Better Auth's built-in limiter (auth routes) + `hono-rate-limiter` with a MongoDB store (other routes) |
| Security headers | Hono `secureHeaders` middleware + an explicit CSP |
| Logging | **pino** with redaction (cookies, auth headers and bodies are never logged) |
| Email | **Resend** (SaaS) for verification and reset emails |
| AI | **Cloudflare Workers AI** REST API (`/accounts/{id}/ai/run/@cf/google/gemma-4-26b-a4b-it`) via plain `fetch` (`apps/api/src/lib/workersAi.ts`) |
| Partner APIs | **Prior Labs TabPFN REST API** (`/tabpfn/*` routes), **SerpApi** (`serpapi` npm package) |
| Telemetry | **Sentry** Node SDK |

### 4.4 Quality and operations
| Concern | Tool |
|---|---|
| Unit / integration tests | **Vitest**, **fake-indexeddb**, **mongodb-memory-server** |
| End-to-end tests | **Playwright** (WebKit + Chromium, offline mode) |
| Lint / format | **ESLint** (`typescript-eslint`, `no-unsanitized`, `security`, `react-hooks`), **Prettier** |
| Performance | **Lighthouse CI**, `size-limit`, `rollup-plugin-visualizer` |
| Security | **CodeQL**, **gitleaks**, `npm audit`, **Dependabot** |
| Hosting | **Render** (web service + blueprint) |
| Build sessions | **Entire CLI** |
| Demo narration | **ElevenLabs** |

---

## 5. Project structure

Monorepo using **npm workspaces**: one repo, three packages.

```
ramble/
├─ apps/
│  ├─ web/                          # the PWA
│  │  ├─ public/
│  │  │  └─ icons/
│  │  ├─ src/
│  │  │  ├─ main.tsx  sw.ts
│  │  │  ├─ app/                    # App shell, store slices, boot sequence
│  │  │  ├─ features/
│  │  │  │  ├─ map/                 # MapLibre, pin layer, locate, long-press
│  │  │  │  ├─ places/              # place sheet, levels
│  │  │  │  ├─ checkin/             # one-tap check-in, "where are you?"
│  │  │  │  ├─ explore/             # "Get me outside", moods, suggestion cards
│  │  │  │  ├─ walk/                # routes, live walk banner, loops
│  │  │  │  ├─ journal/             # timeline, memory composer
│  │  │  │  ├─ updates/             # trail & park updates card (SerpApi)
│  │  │  │  ├─ offline/             # background area caching + "Offline-ready" chip
│  │  │  │  ├─ account/             # sign up / in, recovery key, devices, sync status
│  │  │  │  ├─ share/               # share links
│  │  │  │  └─ settings/            # privacy screen, lock, backup, delete-all, toggles
│  │  │  ├─ lib/
│  │  │  │  ├─ crypto/              # keys, aead, wrap, argon2, account-keys, recovery
│  │  │  │  ├─ db/                  # Dexie schema, repo, migrations
│  │  │  │  ├─ sync/                # push, pull, merge, outbox
│  │  │  │  ├─ ai/                  # /api/ai client, candidate builder, rule-based fallback
│  │  │  │  ├─ personalize/         # feature extraction, TabPFN client, score cache
│  │  │  │  ├─ geo/  net/  media/  offline/  telemetry/
│  │  │  └─ ui/                     # Sheet, Button, Chip, Toast …
│  │  ├─ index.html  vite.config.ts
│  └─ api/                          # the backend
│     ├─ src/
│     │  ├─ index.ts                # Hono app: headers, limits, routes, static files
│     │  ├─ auth.ts                 # Better Auth config
│     │  ├─ db.ts                   # Mongo client, collections, indexes
│     │  ├─ routes/
│     │  │  ├─ sync.ts  vault.ts  media.ts
│     │  │  ├─ ai.ts                # Gemma: suggest, polish journal, summarise updates
│     │  │  ├─ personalize.ts       # TabPFN proxy
│     │  │  ├─ placeUpdates.ts      # SerpApi proxy + cache
│     │  │  └─ account.ts           # export, delete account
│     │  ├─ middleware/             # rateLimit, requireSession, bodyLimit, logger
│     │  └─ lib/                    # workersAi, prompts, tabpfn, serpapi, quota, errors
│     └─ test/
├─ packages/
│  └─ shared/                       # Zod schemas + types shared by web and api
│     └─ src/ envelope.ts  sync.ts  personalize.ts  placeUpdates.ts
├─ docs/  ARCHITECTURE.md  SECURITY.md  hacktoberfest-guide.md
├─ tests/e2e/                       # Playwright
├─ .github/workflows/  ci.yml  codeql.yml  e2e.yml
├─ .github/dependabot.yml
├─ render.yaml
├─ package.json                     # workspaces
├─ .npmrc  .gitignore  LICENSE  README.md
```

---

## 6. Data model

### 6.1 The encrypted envelope (on the device **and** on the server)

```ts
// On the device (IndexedDB)
interface LocalEnvelope {
  id: string;              // random UUIDv4
  kind: Kind;              // local index only; NOT sent to the server
  updatedAt: number;       // local index only
  dirty: 0 | 1;            // has changes not yet synced
  v: 1;
  iv: Uint8Array;          // 12 random bytes, fresh for every write
  ct: ArrayBuffer;         // AES-GCM(DK, JSON{ kind, updatedAt, deleted, data }, AAD = `${id}:${v}`)
}

// What the server stores (MongoDB `records`)
interface ServerEnvelope {
  userId: ObjectId;
  id: string;              // same random UUID
  seq: number;             // server-assigned, increases per user (the sync cursor)
  v: 1;
  iv: Binary;
  ct: Binary;              // opaque; kind, timestamps and the deleted flag are all INSIDE
  size: number;
  receivedAt: Date;
}
```

**Metadata minimisation.** The server can't tell a place from a visit or a journal entry. It doesn't know when you visited (the timestamps are encrypted) or whether a record is deleted (tombstones are encrypted too). It sees only random ids, sizes and when uploads arrived (see SECURITY.md §9 on traffic timing).

### 6.2 Domain types (decrypted, in memory only)

```ts
type Level = 'want' | 'visited' | 'favourite' | 'regular' | 'legend';

interface Place {
  id: string; name: string; lat: number; lon: number;
  kind: 'park'|'trail'|'viewpoint'|'water'|'garden'|'forest'|'beach'|'cafe'|'custom'|string;
  osmId?: string; tags: string[]; wantToGo: boolean; loved?: boolean;
  createdAt: number;
}
interface Visit   { id: string; placeId: string; at: number; source: 'checkin'|'walk-arrival';
                    with?: string[]; journalId?: string;
                    context: { hourBucket: number; dow: number; weather: WeatherBucket; tempBucket: number } }
interface Walk    { id: string; kind: 'to-place'|'loop'; targetPlaceId?: string; plannedRoute?: string;
                    track: string; startedAt: number; endedAt?: number; distanceM: number }
interface JournalEntry { id: string; visitId?: string; walkId?: string; title: string; body: string;
                    tags: string[]; sighting?: { guess: string; confidence: 'low'|'medium' };
                    mediaIds: string[]; aiAssisted: boolean; createdAt: number }
interface Media   { id: string; mime: string; role: 'photo'|'thumb'|'voice'; width?: number; height?: number }
interface SuggestionFeedback { id: string; placeId: string; at: number; action: 'accepted'|'skipped'|'walked' }
```

`Visit.context` and `SuggestionFeedback` are the **personalisation signals**. They stay encrypted on the device, and only anonymous numeric features derived from them are ever sent (§8).

### 6.3 Device tables (Dexie)

| Table | Contents | Encrypted? |
|---|---|---|
| `records` | Envelopes for place, visit, walk, journal, list and feedback records | ✅ |
| `media` | Photo, thumbnail and voice blobs | ✅ |
| `outbox` | Ids waiting to sync | ids only |
| `poiCache` | Public OSM POIs for downloaded areas | ❌ public data |
| `areas` | Downloaded area packs (bbox rounded to ~5 km) | ❌ (cleared by delete-all) |
| `weather` | Forecast per rounded cell | ❌ |
| `onlineCache` | Last TabPFN scores, last trail updates (with fetch time) | ✅ (they reveal interests) |
| `keys` | Wrapped data key(s), salts, lock mode | wrapped |
| `meta` | Schema version, model tier, benchmarks, sync cursor, settings | ❌ non-sensitive |

### 6.4 Server collections (MongoDB Atlas)

| Collection | Fields | Indexes |
|---|---|---|
| `user`, `session`, `account`, `verification` | Managed by Better Auth (email, hashed auth key, sessions) | Better Auth defaults |
| `vault` | `userId`, `wrappedDkByPassword {iv, ct}`, `wrappedDkByRecovery {iv, ct}`, `kdf {alg, m, t, p}`, `v` | `userId` unique |
| `records` | Server envelopes (§6.1) | `{userId:1, id:1}` unique; `{userId:1, seq:1}` |
| `counters` | `userId`, `seq` | `userId` unique |
| `media.files` / `media.chunks` | GridFS: encrypted blobs; metadata `{userId, id}` | `{metadata.userId:1, metadata.id:1}` unique |
| `placeUpdatesCache` | `queryHash`, `results[]`, `fetchedAt` (public data, shared) | `queryHash` unique; TTL 24 h |
| `rateLimits` | Rate-limiter counters | TTL |

### 6.5 Levels
Derived from the visit count, never stored: **want** (0, Want to go) → **visited** (1) → **favourite** (2) → **regular** (5) → **legend** (10). Can't drift out of sync.

---

## 7. AI pipeline (Gemma on Workers AI)

### 7.1 How a request flows
```mermaid
sequenceDiagram
    participant D as Device
    participant A as Ramble API
    participant C as Cloudflare Workers AI (Gemma 4 26B)
    D->>D: Online? If not → rule-based result immediately
    D->>A: POST /api/ai/suggest {context, candidates[≤15]} (session cookie)
    A->>A: Session + rate limit + Zod validation (caps, charset)
    A->>A: Build the prompt from a fixed template (untrusted text in data fields)
    A->>C: Gemma request (server-held token, 15 s timeout)
    C-->>A: Text
    A->>A: Parse JSON, Zod-validate, drop unknown ids, fill gaps with rules
    A-->>D: { picks: [{id, reason}], source: 'gemma' | 'rules' }
```

- **Rendered first, refined second.** The device shows rule-based cards immediately and swaps in Gemma's reasons when they arrive (usually 1–3 s), so the AI never makes the user wait.
- **Prompts live on the server.** The device sends structured data, never a prompt. That means a malicious client can't turn our endpoint into a free general-purpose chatbot.
- **One model, one config line.** `GEMMA_MODEL` in `workersAi.ts`. Because Gemma is open-weight, moving to another host (Vertex AI, a GPU droplet, self-hosted) changes only the client, not the prompts.

### 7.2 Tasks
| Task | Route | Input | Output (Zod-validated) | Sends private text? | Fallback |
|---|---|---|---|---|---|
| **Suggest** | `POST /api/ai/suggest` | Context (minutes, mood, energy, minutes to sunset, rain) + ≤15 candidates `{id, kind, name (public OSM), distM, visited, tabpfn?}` | `{ picks: [{ id, reason ≤140 }] }` × 3 | No | Rule ranker + templated reasons |
| **Polish journal** ✨ | `POST /api/ai/polish` | The note the user wrote + place name (+ one 768 px photo if the model supports images; to verify) | `{ title ≤60, body ≤600, tags ≤6, sighting? }` | **Yes, only when the user taps ✨ Polish** | Note saved as typed |
| **Summarise updates** | inside `/api/place-updates` | ≤5 web snippets (untrusted) + place name | `{ headline ≤120, severity: info\|caution\|closed\|none }` | No (public web text) | First headline as-is |
| Name a spot [L] | `POST /api/ai/name-spot` | Nearby POI kinds | `{ name ≤40 }` | No | "Spot near X" |

**Voice notes:** the phone keyboard's built-in dictation fills the note field, so no audio is ever uploaded.

### 7.3 Guardrails
- **Validate everything.** JSON is parsed and Zod-validated, with one retry, then the rule fallback. Picks must use **ids from the candidate list**; unknown ids are dropped.
- **Untrusted text** (OSM names, user notes, web snippets) goes into clearly delimited data fields, and the system prompt says to treat it as data.
- **No agency.** The model has no tools. Its output is only ever displayed as plain text with length caps.
- **The user is in control.** The user edits polished drafts before saving. Sightings are labelled as guesses. The model is told never to give safety-critical advice (edible plants, whether a trail is safe).
- **Budgets.** `max_tokens` caps (300 for suggestions, 500 for polish), a 15 s timeout, and per-session and global daily limits that keep usage inside the free allocation (§11).

### 7.4 Privacy of AI requests
- Requests go **device → our server → Cloudflare**, so Cloudflare sees our server, never the user's IP. No user id is sent to Cloudflare.
- Suggestions contain **public** place names only. Custom pins are labelled generically (e.g. "your saved spot, park"), never by their private name.
- Journal text leaves the phone **only** on an explicit ✨ Polish tap, and the first time, a short explainer says where it goes.
- Our server **doesn't log** prompts or outputs.

---

## 8. Personalisation (TabPFN)

**Goal:** "Places you'll love". Predict how likely you are to love a candidate place, based on your own history. **[P2]**

### 8.1 How it works
```mermaid
sequenceDiagram
    participant D as Device
    participant A as Ramble API
    participant P as Prior Labs TabPFN
    D->>D: Build training rows from YOUR visited places (decrypted locally)
    D->>D: Build test rows for nearby candidates
    D->>A: POST /api/personalize {columns v1, train[][], labels[], test[][]}
    A->>A: Session check, rate limit, Zod (shape, ranges, row caps)
    A->>P: fit + predict (bearer key held on the server only)
    P-->>A: probabilities
    A-->>D: scores[] (in the same order as test rows)
    D->>D: Save scores encrypted in onlineCache
    D->>D: Feed scores into candidate ranking + Gemma's context
```

### 8.2 Feature schema (`columns v1`), all numeric and anonymous

| # | Feature | Encoding |
|---|---|---|
| 1 | Place kind | Category index (park=0, trail=1, viewpoint=2, water=3, garden=4, forest=5, beach=6, café=7, other=8) |
| 2–7 | Has tag: quiet, view, shade, water, dog-friendly, toilets | 0/1 |
| 8 | Distance from your usual area | Bucket 0–5 (<500 m … >10 km) |
| 9 | Typical visit hour | Bucket 0–5 (early morning … night) |
| 10 | Weekend? | 0/1 |
| 11 | Weather at visit | 0 clear, 1 cloudy, 2 rain |
| 12 | Temperature | Bucket 0–4 |
| 13 | Suggestion accepted before? | 0/1 |

**Label:** `loved = 1` if the place reached *favourite* (2+ visits) or you hearted it, otherwise `0`.

**Never sent:** names, coordinates, OSM ids, place ids, timestamps or the user id. Rows are anonymous, and the server forwards them without logging.

### 8.3 Rules
- **Opt-in toggle:** "Smarter suggestions (sends anonymous numbers, never places)". It's off until the user turns it on, with a "see exactly what's sent" preview.
- **Cold start:** needs at least 15 visited places with at least 3 positive labels. Until then, the rule ranker and Gemma are used. The UI says "Ramble is still learning your taste (8/15)".
- **Caps:** 500 training rows, 50 test rows, 13 columns, so each request stays cheap against Prior Labs' fair-usage limit.
- **Refresh:** when the candidate set changes and the cached scores are more than 24 h old.
- **Offline:** the last scores are used. Places without a score fall back to rules.
- **Final ranking score:** `0.45 × TabPFN + 0.35 × rule score (distance, never-visited, sunset, weather) + 0.20 × Want-to-go boost`. Gemma then picks 3 from the top 15 and explains why.

---

## 9. Trail and park updates (SerpApi)

**Goal:** before you head out, show any **recent closures, works, events or alerts** for the place. **[P2]**

### 9.1 Flow
1. When a place sheet opens or a walk is planned while online, the device calls `GET /api/place-updates?name=<public name>&area=<suburb>`.
   - The name and suburb come from public OSM data. **No coordinates are sent.**
   - **Custom pins you named yourself are never looked up**, because their names may be private ("Mum's house").
2. The API normalises the query and checks the **shared 24 h cache** in `placeUpdatesCache`. Results are public, so caching across users is safe and saves quota.
3. On a cache miss it calls SerpApi (Google, results from the past month), with a query like `"<name>" <area> (closure OR closed OR event OR works OR alert)`.
4. It returns ≤5 results `{title, snippet, source, date, url}`. The server validates URLs (`https:` only) and caps snippet lengths.
5. The server asks **Gemma** to summarise the results into a one-line headline with a severity (`info`, `caution`, `closed` or `none`). The summary is cached alongside the results, so it's shared by everyone looking at that place for 24 h.
6. The result is saved encrypted in `onlineCache`. Offline, the card shows "Last checked 2 h ago".

### 9.2 Quota protection
- The SerpApi free plan is about **250 searches a month** (check serpapi.com/pricing). Protection layers: the shared cache, a per-session limit (10/hour), a global daily budget (8/day, enforced in Mongo), and lookups only when the user explicitly opens a place or plans a walk (no background fetching).
- When the budget runs out, the card says "Updates unavailable right now" and nothing else breaks.

### 9.3 Safety
Web snippets are **untrusted**: they're shown as plain text, links open only for `https:` with `rel="noopener noreferrer"`, and they go to Gemma as data only. The card always says: "From the web, may be out of date. Check official sources."

---

## 10. Accounts and end-to-end-encrypted sync (MongoDB Atlas)

**[P3]** Optional. Ramble works fully without an account.

### 10.1 Account modes
| Mode | How you get it | What you get |
|---|---|---|
| **Guest** (default) | Open the app | Everything on the device. Online features use an **anonymous session** (Better Auth anonymous plugin) for rate limiting |
| **Account** | Sign up with email + password | Plus encrypted backup, multi-device sync, recovery. The anonymous session is linked to the new account |

Google sign-in isn't offered. With an OAuth login there's no password to derive an encryption key from, which would weaken end-to-end encryption (a passkey-based option is planned [L]).

### 10.2 Keys: zero-knowledge, Bitwarden-style
```mermaid
flowchart TD
    PW[Password] -->|Argon2id m=64 MiB t=3 p=1<br/>salt = SHA-256 of 'ramble:' + normalised email| MK[Master key<br/>never leaves the device]
    MK -->|HKDF 'ramble-auth-v1'| AK[Auth key]
    MK -->|HKDF 'ramble-enc-v1'| EK[Encryption KEK]
    AK -->|sent as the 'password'| BA[Better Auth<br/>hashes it again with scrypt]
    EK -->|AES-KW wrap| W1[wrappedDkByPassword → vault]
    RK[Recovery key<br/>random 256-bit, shown once] -->|AES-KW wrap| W2[wrappedDkByRecovery → vault]
    DK[Data key DK<br/>same key that already encrypts local data] --- W1 & W2
    DevK[Device key] -->|wrap| W3[Local wrapped DK → IndexedDB<br/>instant offline unlock]
```

- **The server never sees the password or the master key.** It receives only the derived auth key, which it hashes again, so even a full database leak needs an Argon2id brute-force attack **per user**.
- **The data key stays the same.** A guest who signs up keeps their existing local data key, so nothing is re-encrypted. It just gets wrapped two more ways.
- **Recovery key:** 256 random bits shown once as a grouped code (e.g. `RMBL-7Q4K-…`). The user must save it, and the app confirms they have by asking for 4 characters back.
- **Password change:** derive the new master key, re-wrap the data key, update the auth key. Instant.
- **Forgot password:**
  - The email reset restores **login**.
  - The vault then needs the **recovery key**, *or* any still-signed-in device, which re-wraps the data key under the new password.
  - Without either, the old encrypted data can't be recovered, by design. The UI says this clearly at sign-up.

### 10.3 Sync protocol
| Step | Detail |
|---|---|
| **Push** | `POST /api/sync/push` with up to 100 envelopes (each ≤ 64 KB). The server assigns `seq = ++counter[userId]` and **upserts** by `{userId, id}`. |
| **Pull** | `GET /api/sync/pull?since=<seq>&limit=500` → envelopes with `seq > since`, plus `nextSeq`. |
| **Merge** | **On the device**: decrypt, compare the inner `updatedAt`, newer wins. If the local copy is newer, mark it dirty, so it's re-pushed. |
| **Tombstones** | Deletions are encrypted records with `deleted: true` inside. They're compacted after 90 days [L]. |
| **Media** | `PUT /api/media/:id` (encrypted blob, ≤ 2 MB, streamed into GridFS). `GET` streams it back. Per-user quota: **50 MB** (Atlas free tier is 512 MB in total). Upload happens after the record syncs. |
| **When** | On app open, after local writes (debounced 5 s), when the device comes back online, and when a "Sync now" button is tapped. Pulls and pushes are batched to reduce timing leaks. |
| **Conflicts** | Last write wins on the device's `updatedAt`. A device clock that's badly wrong could lose an edit. That's accepted for now, and a vector clock is planned [L]. |

### 10.4 Account management
- **Devices:** list sessions, sign out a device, sign out everywhere.
- **Export:** an encrypted `.ramble` backup file, which also works for guests.
- **Delete account:** deletes the user's records, media, vault, sessions and auth records in one server transaction, then crypto-shreds the device too. Typed confirmation is required.

---

## 11. Backend API

All routes are under `/api`, same origin as the app, JSON only, Zod-validated, and size-limited.

| Method | Route | Auth | Limit | Purpose |
|---|---|---|---|---|
| * | `/api/auth/*` | – | Better Auth limiter (sign-in 5/min/IP) | Sign up / in / out, verify email, reset, anonymous session |
| GET | `/api/vault` | account | 30/min | Get wrapped keys |
| PUT | `/api/vault` | account (fresh session) | 5/min | Set or re-wrap keys |
| POST | `/api/sync/push` | account | 60/min | Upload envelopes |
| GET | `/api/sync/pull` | account | 60/min | Download envelopes |
| PUT/GET/DELETE | `/api/media/:id` | account | 30/min | Encrypted blobs |
| POST | `/api/ai/suggest` | any session | 30/hour + global daily budget | Gemma ranks and explains 3 picks |
| POST | `/api/ai/polish` | any session | 20/hour + global daily budget | Gemma polishes a journal note (user-initiated only) |
| POST | `/api/personalize` | any session | 10/hour | TabPFN proxy |
| GET | `/api/place-updates` | any session | 10/hour + global daily budget | SerpApi proxy + cache |
| GET | `/api/account/export` | account | 2/hour | All ciphertext as one file |
| DELETE | `/api/account` | account (fresh session + password) | 2/hour | Delete everything |
| GET | `/api/health` | – | – | Uptime check (no details) |

**Error format:** `{ error: { code, message } }`. There are no stack traces in responses and no hints about whether an account exists.

---

## 12. Offline and online strategy

### 12.1 Feature matrix
| Feature | Offline | Online adds |
|---|---|---|
| Map + your pins | ✅ cached area | Any area |
| Search | ✅ your places + cached POIs | Photon worldwide |
| Check-in, levels, journal | ✅ | Sync to your other devices |
| "Get me outside" suggestions | ✅ rule-based picks with templated reasons | **Gemma** picks and explains |
| Journal | ✅ saved as typed | **✨ Polish** with Gemma (on tap) |
| "Places you'll love" | ✅ last saved scores | Fresh TabPFN scores |
| Trail and park updates | ✅ last result + age | Fresh SerpApi results |
| Walk to a place | ✅ saved route / straight-line direction | A new OSRM route |
| Weather and sunset | ✅ cached forecast (3 days); sunset always | Fresh forecast |
| Backup and sync | Queued in the outbox | Sync |

### 12.2 What's cached where
| Asset | Store | Strategy | Size |
|---|---|---|---|
| App shell | Cache API | Precached, versioned | ~1.8 MB |
| Style, fonts, sprites, tiles | Cache API | Cache-first; tiles you view are kept, plus a quiet background prefetch of z10–z14 around you on Wi-Fi | A few MB |
| POIs | IndexedDB | Fetched in the background around you; refreshed after 14 days | < 1 MB |
| Weather | IndexedDB | Stale-while-revalidate | KBs |
| Online results (Gemma picks, TabPFN scores, trail updates) | IndexedDB (encrypted) | Last good result + time | KBs |
| Your data | IndexedDB (encrypted) | Source of truth | Grows |

### 12.3 Offline readiness, with no download step
There's **no wizard and nothing to download**. While you use Ramble online, it quietly keeps what you'll need later:
1. Map tiles you've viewed stay cached. On Wi-Fi, it also prefetches a small area (about 3 km) around you in the background, a few MB at most.
2. Outdoor POIs and the 3-day forecast around you are refreshed in the background.
3. It asks for persistent storage with `navigator.storage.persist()`. On iOS, a one-time gentle **Add to Home Screen** tip explains that it keeps your places safe (installed web apps avoid Safari's 7-day storage eviction).
4. A small status chip ("Offline-ready for Northcote ✓") shows it worked. No progress bars, no decisions.

### 12.4 Connectivity
- `navigator.onLine` plus a probe of `/api/health`. Online-only buttons show clear disabled states, never endless spinners.
- The sync outbox is retried with exponential backoff. Online lookups (Gemma, TabPFN, updates) **aren't queued**. They simply run next time. A journal entry saved offline shows a "✨ Polish when online" hint.

---

## 13. Key flows

### 13.1 First launch (guest)
Service worker installs → generate the data key and device key → anonymous session (quietly, only if online) → welcome card → "Show where I am" (explained first) → map. Background caching of the area starts quietly.

### 13.2 Get me outside
```mermaid
sequenceDiagram
    participant U as User
    participant E as Explore
    participant C as onlineCache / API
    U->>E: 60 min · golden hour · easy
    E->>E: Candidates from saved + cached POIs (kdbush)
    E->>C: TabPFN scores (cached, or fresh if online)
    E->>E: Final score = TabPFN + rules + Want-to-go
    E->>U: 3 rule-based cards immediately
    E->>C: POST /api/ai/suggest(context, top 15), if online
    C-->>E: Gemma's 3 picks + reasons (validated on the server)
    E->>C: Trail updates for the 3 picks (cached, or fresh if online)
    E->>U: Cards refine in place: Gemma's reason · "places you'll love 82%" · ⚠️ update badge
```

### 13.3 Walk, arrive, memory
1. Route from OSRM (online), saved on the walk record. Offline: the saved route, or a straight-line direction.
2. `watchPosition` **only in walk mode**, throttled, saved every 15 s.
3. Arrival within 40 m → check in → level-up celebration.
4. Memory: photo (resized, EXIF stripped) + a note (typed or keyboard-dictated) → saved encrypted right away → optional **✨ Polish** (online) → Gemma draft → the user edits → saved → queued for sync.

### 13.4 Sign up (from guest)
```mermaid
sequenceDiagram
    participant U as User
    participant D as Device
    participant A as API
    U->>D: Email + password (strength meter + breached-password check)
    D->>D: Argon2id → master key → auth key + encryption key
    D->>A: Better Auth sign-up (email, auth key), linked to the anonymous session
    A-->>U: Verification email (Resend)
    D->>D: Generate recovery key; wrap DK twice
    D->>A: PUT /api/vault {wrappedDkByPassword, wrappedDkByRecovery}
    D->>U: "Save your recovery key" (confirm 4 characters)
    D->>A: First full push of envelopes + media
```

### 13.5 Sign in on a new device
Email + password → derive the keys → sign in with the auth key → `GET /api/vault` → unwrap the data key with the encryption key → wrap it with a new device key locally → pull all envelopes → decrypt into the store → media downloads lazily.

---

## 14. Performance design

### 14.1 Budgets (enforced in CI where possible)
| Metric | Budget |
|---|---|
| Initial JS (gzip), excluding MapLibre | ≤ 120 KB |
| MapLibre chunk (gzip) | ≤ 280 KB, in parallel (v6 measured at 268 KB) |
| First Contentful Paint, repeat visit (service worker) | ≤ 0.8 s |
| First Contentful Paint, first visit (mid-range phone, 4G) | ≤ 1.5 s |
| Map interactive (warm) | ≤ 1.5 s |
| Unlock + decrypt 500 places | ≤ 150 ms |
| API p95 (sync push of 100 records) | ≤ 300 ms |
| `/api/place-updates` p95, cache hit / miss | ≤ 80 ms / ≤ 3 s |
| `/api/personalize` p95 | ≤ 4 s (runs in the background; the UI never waits on it) |
| `/api/ai/suggest` p95 | ≤ 3 s (rule-based cards show instantly; Gemma refines them) |
| First request after Render's free instance sleeps | ~30–60 s for API calls only; the app shell is served by the service worker |

### 14.2 Techniques
- **Code splitting by tab and sheet.** Account, sync and Argon2 code loads only when used.
- **Pins on the GPU.** A single GeoJSON source with symbol layers, not DOM markers.
- **kdbush spatial index** in memory. **Batched decryption**, with places first and media loaded lazily.
- **Images:** 1600 px WebP, 256 px thumbnails, 768 px if a photo is sent with ✨ Polish.
- **Gemma:** short outputs (`max_tokens` caps), compact prompts (candidates as terse JSON), and a 15 s timeout with a rule fallback. Trail-update summaries are cached and shared for 24 h.
- **Online lookups never block.** Suggestions render from rules and cache instantly, and Gemma's reasons, TabPFN scores and updates **refine** the cards when they arrive.
- **Nothing heavy to download.** No model, no AI runtime. The whole app is about 0.4 MB gzipped.
- **Sync** runs in the background and in batches. Pull is paginated.
- **Server:** Hono on Node; Mongo indexes on every query path; connection pooling; shared SerpApi cache; gzip/brotli for JSON; static assets `immutable`.
- **Cold starts:** Render **free** instance (no card needed). It sleeps after 15 minutes idle, so the first request afterwards takes ~30–60 s. Repeat visits still open instantly because the service worker serves the app shell from cache; only API calls wait. Wake the service before demos. Region **Singapore** (closest to Australia).

---

## 15. Deployment and infrastructure

### 15.1 Why one origin
The API serves the built PWA **and** `/api/*` from one Render web service:
- Session cookies are **first-party** (`SameSite=Lax`, `HttpOnly`, `Secure`). They aren't blocked by Safari, and there's no CORS.
- The CSP `connect-src` for our API is simply `'self'`.
- There's one deploy, one set of headers, and one thing to secure.

### 15.2 `render.yaml`
```yaml
services:
  - type: web
    runtime: node
    name: ramble
    region: singapore
    plan: free
    buildCommand: npm ci && npm run build      # builds packages/shared, apps/web, apps/api
    startCommand: node apps/api/dist/index.js  # serves /api/* and the PWA's static files
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: MONGODB_URI
        sync: false            # set in the dashboard, never committed
      - key: BETTER_AUTH_SECRET
        generateValue: true
      - key: BETTER_AUTH_URL
        sync: false
      - key: CLOUDFLARE_ACCOUNT_ID
        sync: false
      - key: CLOUDFLARE_AI_TOKEN
        sync: false
      - key: TABPFN_API_KEY
        sync: false
      - key: SERPAPI_KEY
        sync: false
      - key: RESEND_API_KEY
        sync: false
      - key: SENTRY_DSN
        sync: false
```
Security headers are set **in the Hono app** (SECURITY.md §5.1–5.2), so they apply to both the static files and the API.

### 15.3 MongoDB Atlas
- **M0 free cluster**, AWS **Sydney** region (or the closest available to Render Singapore).
- **Network access:** only Render's published outbound IP ranges for the Singapore region, **not** `0.0.0.0/0`.
- A database user with `readWrite` on the `ramble` database only. TLS is enforced by default.
- Separate `ramble_dev` and `ramble` databases. Indexes are created on startup in `db.ts`.

### 15.4 Environments
| Env | Where | Notes |
|---|---|---|
| Local | Vite (`https://localhost:5173`) proxying `/api` to the API on `:8787` | HTTPS for geolocation and the camera; `.env.local` (gitignored) |
| Preview | Render PR previews | Uses the `ramble_dev` database |
| Production | `ramble.onrender.com` (custom domain [L]) | `main` branch |

---

## 16. Observability (Sentry)

| Where | Captured | Never captured |
|---|---|---|
| Device: performance | FCP, LCP, map-interactive, unlock ms, sync duration, "rule cards → Gemma cards" time | URLs with queries, coordinates |
| Server: AI traces | A span per Gemma call: task, model, latency, input/output token counts (from the response), retries, validation failures, fallback used, ids dropped | Prompts, outputs, place names, notes |
| Server: traces | Spans for each route, **TabPFN latency**, **SerpApi latency + cache hit rate**, Mongo query time | Bodies, cookies, emails, query strings |
| Errors (both) | Type, stack (source maps), release | Breadcrumbs from fetch, console or DOM (disabled) |

Settings: `sendDefaultPii: false`, `beforeSend` and `beforeSendSpan` scrubbers, no Session Replay, offline transport on the device, and an **opt-out toggle**. Together the device and server traces tell the whole agent story (Gemma → TabPFN → SerpApi). That's the **Sentry Agent Tracing** entry.

---

## 17. Testing strategy

| Level | What | Tool |
|---|---|---|
| Unit | Crypto: round trip, **tamper detection**, AAD binding, wrap/unwrap, Argon2 parameters, auth key ≠ encryption key | Vitest |
| Unit | Geo, levels, rule ranker, feature extraction (**asserts no names or coordinates in TabPFN rows**), polyline, rounding | Vitest |
| Unit | Zod schemas against malicious inputs (model output, web snippets, oversized payloads) | Vitest |
| Integration | Repository on fake-indexeddb; sync merge with two simulated devices and conflicting edits | Vitest |
| Integration (API) | Routes against **mongodb-memory-server**: auth flows, vault, push/pull, quotas, rate limits, **a user can never read another user's records** | Vitest |
| Contract | Shared Zod schemas used by both the web app and the API | Type checks |
| Unit (API) | Gemma client (mocked fetch): errors become rule fallbacks; output parser drops unknown ids, caps lengths, survives prompt-injection candidates | Vitest |
| End-to-end | Browse online → offline mode → map, Explore (rule cards), check-in, walk simulation; sign-up → second browser context signs in → data appears | Playwright |
| Security | CSP and headers on the preview URL, EXIF stripped, no HTML sinks (lint), secrets scan | CI |
| Manual | **Real iPhone, airplane mode, a real walk** | You 🌳 |

---

## 18. CI/CD

```mermaid
flowchart LR
    PR[Pull request] --> CI[ci.yml: typecheck · lint · unit · API integration<br/>build · size budget · npm audit · gitleaks]
    PR --> CQ[codeql.yml]
    PR --> E2E[e2e.yml: Playwright incl. offline + sync]
    PR --> PREV[Render PR preview]
    CI & CQ & E2E --> M[Merge to main] --> PROD[Render deploy]
```
- `npm ci` only. `npm audit --audit-level=high` fails the build. Actions are pinned to commit SHAs, and the workflow token has `contents: read` only.
- Dependabot opens weekly grouped updates. Optional Copilot PR review.

---

## 19. Roadmap
| Feature | Notes |
|---|---|
| Passkey / Face ID unlock + passkey accounts [L] | WebAuthn PRF derives the encryption key, so no password is needed |
| Shared lists [L] | A per-list key carried in the invite link's `#` fragment, so the server sees only ciphertext |
| Google Takeout import [L] | Parsed on the device, and an instant head start for TabPFN |
| Offline routing [L] | Foot-network graph + A* in a worker |
| PMTiles region packs [L] | For large areas |
| Recaps, heatmap, explored hex map [L] | Computed on the device |
| Object storage for photos [L] | Cloudflare R2 / S3 when 512 MB isn't enough |
| Vector-clock conflict resolution [L] | Replaces last-write-wins |

---

## 20. Open questions to resolve first

1. ✅ **Resolved: on-device vs hosted Gemma.** E2B in the browser is a 2 GB download and 270M gave unusable output (tested Oct 10), so Gemma is hosted on Cloudflare Workers AI. No downloads for users.
2. **Workers AI + Gemma 4 26B:** confirm image input support, whether JSON mode / `response_format` works for this model, typical latency from Singapore, and real neuron usage per suggestion (to size the daily budget).
3. **Cloudflare free plan:** confirm no card is needed, and create an API token scoped to **Workers AI only**.
4. **TabPFN REST:** the exact `/tabpfn/*` request flow (prepare upload → upload → fit → predict) and the free usage limits for our row and column caps.
5. **SerpApi** current free quota. Which engine gives the best closure and event results (Google vs Google News)?
6. **Better Auth:** the anonymous plugin → account linking with the Mongo adapter; mounting under Hono; using the auth key as the password.
7. **Render:** outbound IP ranges for Singapore (for the Atlas allow-list). The free plan has no static outbound IPs, so Atlas may need a wider allow-list (to verify).
8. **Entire CLI** on Windows.
