# How Ramble works

A plain-language walkthrough of the code as it stands on **12 Oct 2026**. ARCHITECTURE.md is the original design; this note describes what actually ships. Paths are relative to the repo root.

---

## 1. The big picture

Ramble is a **website that behaves like an app** (a PWA). You open a link and there's nothing to install. Once you've opened it, it keeps working with no signal.

```
Your phone / laptop                         Render (one web service, one origin)
┌─────────────────────────────┐            ┌──────────────────────────────────────┐
│ React app (apps/web)        │  /api/*    │ Hono API (apps/api)                  │
│  • MapLibre map             │ ─────────► │  • serves the built app files        │
│  • encrypted IndexedDB      │            │  • Gemma (Cloudflare Workers AI)     │
│  • service worker (offline) │            │  • SerpApi, TabPFN proxies           │
│  • rules-based ranking      │            │  • accounts + ciphertext sync (Atlas)│
└─────────────────────────────┘            └──────────────────────────────────────┘
        │ direct, keyless, open services: OpenFreeMap tiles, Overpass (OSM places),
        │ Photon (search), OSRM (routes), Open-Meteo (weather)
```

Three npm workspaces:

| Package | What it is |
|---|---|
| `apps/web` | The PWA: React 19, Vite, Tailwind v4, MapLibre, Zustand, Dexie, WebCrypto |
| `apps/api` | Hono on Node 22: serves the PWA **and** `/api`, holds every secret key |
| `packages/shared` | Zod schemas, the domain model (levels, streaks), the rule-based ranker. Both the app and the API use the same code, so they always agree |

**Core design rule: rules first, AI second.** Everything works without the network or the AI. The online partners make results better but never block them.

**Every partner is optional.** `GET /api/features` (`apps/api/src/app.ts`) tells the app which keys are set (`ai`, `placeUpdates`, `personalize`, `accounts`), and the app hides any feature whose key is missing.

---

## 2. What a user does, and what happens underneath

### 2.1 First open
- `Welcome.tsx` asks one question: *how many days a week do you want to get outside?* That number becomes your **weekly goal** (`lib/goal.ts`).
- On the first run, `lib/db` creates a random **data key** and a **device key** (see §4). Nothing is sent anywhere.
- The service worker (`src/sw.ts`) precaches the app shell, so the next visit opens offline.
- The top bar shows a **weather chip** from Open-Meteo, using only a location rounded to about 1 km (`lib/weather.ts`).

### 2.2 "Find my walk" (Explore)
`features/explore/explore.ts` and `ExplorePanel.tsx`

1. You pick **time** (30 min to 8 h), **mood** (quiet, views, nature, golden hour, surprise) and **energy** (easy, moderate, push).
2. **Finding real places** (`placesNear`) tries the fastest source first:
   1. memory
   2. on-device cache (7 days, per ~5 km grid cell)
   3. Overpass/OpenStreetMap: the browser asks directly and races our `/api/places`
   4. if neither answers within 8 s, named places from the **map tiles already on screen**

   Explore never dead-ends.
3. The **rule ranker** (`packages/shared/src/suggest.ts`) scores each place:
   - The round trip must fit your time, scaled down for lower energy.
   - Closer is better.
   - Bonuses for somewhere new, for a match with your mood, for reaching it before sunset (from SunCalc), and a stable random bonus for "surprise".

   The top 3 appear **instantly** with templated reasons, for example: "12 min walk to this lookout, somewhere you haven't been yet."
4. If you're online:
   - **TabPFN (optional, opt-in)** re-ranks the shortlist using your own history. The blend is 45% TabPFN and 55% rule order. See §3.3.
   - **Gemma** (`POST /api/ai/suggest`) gets the top 15 candidates as data (id, kind, public name, distance, visit count). It picks 3 and writes a one-line reason for each. The server keeps only ids that were actually in the list, so Gemma can't invent a place. If anything fails, you keep the rule picks.
5. The cards swap in place: "Gemma's pick" with its reason, and "💚 87% your kind of place" when TabPFN is on.

### 2.3 Plan a trip in your own words
`features/trip/TripPlanner.tsx`, `apps/api/src/lib/tripPlan.ts`, `lib/places/search.ts`

- You type something like: *"St Kilda today, coffee and fish and chips on the way, Comm Bank on the way back, then home."*
- **Gemma** turns that into ordered stops: `{query, category, leg: out|back}`, plus whether you're coming home and how you're travelling (walk, bike or car, each way). The prompt treats your text as data, and the output is checked against known categories, capped at 8 stops and re-ordered if needed.
- For each stop, **Photon** (an OSM geocoder) finds **real options**:
  - Named places use Photon's ranking.
  - "Any café"-type stops are sorted by distance from where the stop fits on the way.
- **You choose** each stop from up to 6 options. Nothing is picked silently.
- You can also add stops by hand, or tap any café or park on the map and choose **Add to trip** (`MapPickCard.tsx`, which is new).
- If Gemma is unavailable, the planner returns an empty plan and you add stops yourself.

### 2.4 Walk here / start the trip
`app/store/walkStore.ts`, `lib/geo/route.ts`, `features/walk/WalkBanner.tsx`

- **Routes:**
  - Routes come from **OSRM** on the FOSSGIS servers, with separate foot, bike and car profiles. The way back is routed separately.
  - **Ferry fix:** waterfront stops like St Kilda Pier can snap onto a ferry line. If OSRM returns a ferry step, the stops are nudged 200 m and then 400 m inland and the route is requested again.
  - Offline or if the router is down, Ramble falls back to a **straight line** with time estimates.
- **No location (blocked, or a laptop)?** The trip is planned from the map centre and the app says so.
- **Location tracking:**
  - Location is watched **only while a trip is active**, and the watch is cleared as soon as the trip ends.
  - If the app is hidden for more than 30 minutes, the trip stops.
  - There's no background tracking.
- **Live banner:** distance left along the route (both legs), then **arrival**. You've arrived when you're within 60 m (walk), 80 m (bike) or 150 m (car) with GPS accuracy of 60 m or better.
- **On arrival:** your phone buzzes, and a **system notification** is sent through the service worker ("You're at X! Snap a few photos and add a note"). You can switch notifications on in the You tab.

### 2.5 Check in, level up, journal
`features/checkin`, `features/journal/MemoryComposer.tsx`, `packages/shared/src/domain.ts`

- **Check-in** saves a *visit*. A place's **level is derived from its visit count** and never stored, so it can't drift: **Want to go (0) → Visited (1) → Favourite (2) → Regular (5) → Local legend (10)**. Each level-up gets a celebration animation.
- **Journal:**
  - Each entry has a note (typed or keyboard-dictated, and no audio is recorded) plus a photo.
  - Photos are checked by their magic bytes, then redrawn on a canvas. That strips **all EXIF/GPS** data, and resizes them to 1600 px WebP (`lib/media/photo.ts`).
- **✨ Polish:**
  - Sends **that one note** to Gemma, and only when you tap the button (`/api/ai/polish`).
  - Gemma returns a title, a 1–4 sentence first-person entry and tags. It's told never to invent facts or give safety, medical or foraging advice.
  - If Gemma fails, your note stays as you typed it.

### 2.6 The You tab
`features/you/*`

| Feature | How it works |
|---|---|
| **Weekly goal ring + weekly streak** | Days out per ISO week; several check-ins on one day count once (`weeklyGoalProgress`) |
| **Touched-grass streak** | Consecutive weeks with at least one visit |
| **Fog of war** | Mist covers about 1.5 km around you, and every check-in clears a 220 m hole. **Explored %** is the share of 150 m cells uncovered (`lib/geo/explored.ts`) |
| **Heat map** | One heat point per visit |
| **Monthly Wrapped** | Days out, visits, new places, memories, your top spot and your busiest weekday, all worked out on the device |
| **Places by level, journal timeline** | From your decrypted records |
| **Encrypted backup file** | See §4.3 |
| **Account card** | Optional end-to-end-encrypted sync (§4.2) |
| **Toggles** | Places you'll love (TabPFN), arrival notifications, telemetry |
| **Delete all** | Crypto-shreds the key |

### 2.7 Trail and park updates (SerpApi)
`apps/api/src/lib/serpapi.ts`, `routes/placeUpdates.ts`, `features/places/PlaceUpdates.tsx`

1. Opening a place sends its **public name and suburb** to our server. No coordinates are sent, and spots you named yourself are never looked up.
2. The server runs a Google search through SerpApi for the past month: `"<name>" <area> (closure OR closed OR event OR works OR alert)`.
3. Results are untrusted. Only https links are kept, every field is capped, and **only results that actually name the place survive**. This was added after Arizona creek closures showed up for "Merri Creek Trail".
4. Gemma summarises what's left into one headline with a severity: `info`, `caution`, `closed` or `none`.
5. A shared 24 h cache plus per-IP and daily budgets keep SerpApi usage to a handful of searches a day.

---

## 3. The AI layer

### 3.1 Gemma on Cloudflare Workers AI
`apps/api/src/lib/workersAi.ts`

- **Model:** `@cf/google/gemma-4-26b-a4b-it` (open-weight, Apache-2.0). It's called **only from the server**, so the token stays secret and Cloudflare never sees users' IP addresses.
- **Four tasks:**
  - **suggest:** pick 3 places and explain why
  - **polish:** a journal note
  - **plan-trip:** turn words into stops
  - **summarise updates:** one-line trail heads-up
- **Thinking is off** (`enable_thinking: false`). Gemma 4 is a reasoning model, and its thinking used up the token budget on short JSON tasks. That was the "unusable model output" bug.
- **Guardrails, the same for every task:**
  - The prompts are fixed and live on the server. The client sends structured data, so the endpoint can't be used as a free chatbot.
  - Untrusted text (OSM names, your note, web snippets) goes in a JSON data field, and the prompt says to ignore instructions inside it. The smoke test includes a candidate literally named "Ignore previous instructions…".
  - Output is parsed tolerantly (`extractJsonObject`), validated, capped and cleaned. For suggestions, any id that wasn't in the candidate list is dropped.
  - Every task has a non-AI fallback, a timeout and token caps.

### 3.2 Why not on the device?
Gemma 4 E2B in the browser was tested on Oct 10. It's a **2 GB download**, and the 270M model gave unusable output. "Just open it and go outside" can't start with a 2 GB download. Because the weights are open, moving the model to the cloud was a hosting decision, not a rewrite.

### 3.3 TabPFN: "Places you'll love"
`lib/personalize/features.ts`, `apps/api/src/lib/tabpfn.ts`

- It's **opt-in**, and only turns on once you've visited **15 places with at least 3 "loved" ones** (2 or more visits).
- Each place becomes a row of **13 anonymous integers**: kind, tag flags, distance bucket from your usual area (the median of your places, never a stored home), usual hour bucket, weekend, accepted-before flag.
- **No names, coordinates, ids or timestamps** are ever sent. A test checks this.
- Training rows are your visited places, labelled "loved" or not. Test rows are today's candidates. TabPFN learns from your rows in-context and returns a probability per candidate, with no training run and no model to host.

---

## 4. Privacy and security

### 4.1 On the device
`lib/crypto/envelope.ts`, `lib/db/repo.ts`

- **Every record is an AES-GCM-256 envelope.** That covers places, visits, journal entries and photos.
- **IVs:** each write uses a fresh 96-bit IV, and the AAD (`id:version`) binds each ciphertext to its record, so records can't be swapped.
- **Keys:**
  - One **data key** encrypts everything.
  - It's stored only **wrapped** (AES-KW) by a **non-extractable device key**, so page code can use it but can't read its bytes.
- **Validation:** records are Zod-validated after decryption, so a tampered record can't crash the app.
- **Delete all** destroys the key (crypto-shredding).

### 4.2 Optional accounts: zero-knowledge sync on MongoDB Atlas
`lib/crypto/account.ts`, `lib/sync/account.ts`, `apps/api/src/lib/syncStore.ts`, `routes/account.ts`

**How the keys work:**
```
password ─Argon2id (64 MiB, t=3, salt from email)─► master key
    ├─HKDF "ramble-auth-v1" ─► auth key        → server (Better Auth hashes it again)
    └─HKDF "ramble-enc-v1"  ─► encryption key  → wraps the data key (stays on device)
recovery key (256 random bits, shown once as RMBL-XXXX-…) → also wraps the data key
```

**What the server sees:**
- The server never sees your password, master key or data key.
- **Atlas stores only** ciphertext envelopes, two wrapped copies of the data key (one for the password, one for the recovery key), a sync counter, and encrypted photos of up to 2 MB each.

**How sync works:**
- **Push** sends envelopes, and the server assigns an increasing sequence number to each.
- **Pull** fetches everything since your last sequence number.
- Merging happens on the device: newer wins.

**Account limits:**
- There's no password-reset email. Under end-to-end encryption, **the recovery key is the only way back**, and that's by design.
- Every query is scoped to the signed-in user, and **delete account** removes everything.

### 4.3 Backup file
`lib/backup.ts`

- Exports your places, visits and notes, encrypted with a passphrase you choose (PBKDF2-SHA256 with 600k iterations → AES-GCM).
- It's safe to keep in email or a drive.
- Photos aren't included.

### 4.4 Server and web hardening
`apps/api/src/security.ts`, `middleware/*`

- **Strict CSP:** no inline scripts, no third-party scripts, and an explicit `connect-src` allow-list. `'wasm-unsafe-eval'` is allowed only for Argon2.
- **Headers:** HSTS, COOP/CORP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- **Same origin only:** requests are checked with `Sec-Fetch-Site`, and the API sends `no-store`.
- **Limits:** request bodies are capped at 256 KB. There are per-IP rate limits plus global daily budgets for Gemma, SerpApi and TabPFN, held in memory (they reset when the instance restarts).
- **Privacy:**
  - Logs are redacted.
  - Sentry spans carry latency and outcomes only, never prompts, notes or coordinates, and users can switch telemetry off.
  - Third parties get coarse data: Photon and Open-Meteo get about 1 km precision.

---

## 5. Offline: what works with zero bars

| Works offline | How |
|---|---|
| App opens | Service worker precache |
| Map | Tiles you've viewed are cached (cache-first, 30 days, 5000 tiles) |
| Explore | Places cached per area for 7 days, plus the rule ranker |
| Check-in, levels, journal, You tab | Encrypted IndexedDB is the source of truth |
| Walk | Straight-line route and distance |
| Not offline | Gemma, TabPFN, trail updates, sync, new searches. They return when you're back online |

**Not built yet:** background prefetch of the area around you, and offline turn-by-turn routing.

---

## 6. Quality and deployment

- **Tests:** 88 Vitest tests across 18 files. They cover crypto tamper detection, the vault, backup, the TabPFN features (no identifying data), the ranker, the Gemma parsers (including prompt injection), trip parsing, routing, places, updates, accounts and static serving.
- **CI:** GitHub Actions runs typecheck, lint (`security`, `no-unsanitized`), tests and build on every push.
- **Smoke test:** `npm run smoke` hits the **live** site like a user would: security headers, real places, a real Gemma answer, and refusing cross-site requests.
- **Hosting:** a single Render web service in Singapore from `render.yaml`, health-checked on `/api/health`. It's currently `plan: free`; change that to `starter` if you use the credit.

---

## 7. Where each partner is used

| Partner | Used for | Main files |
|---|---|---|
| **Gemma 4** (Workers AI) | Suggestions + reasons, ✨ Polish, trip planning from words, trail-update summaries | `apps/api/src/lib/{workersAi,suggest,polish,tripPlan,updatesSummary}.ts` |
| **Render** | Hosts the whole product: PWA + API on one origin, Blueprint, health check | `render.yaml`, `apps/api/src/index.ts` |
| **TabPFN** | "Places you'll love" from anonymous rows | `lib/personalize/*`, `apps/api/src/lib/tabpfn.ts` |
| **SerpApi** | Trail and park closures and events | `apps/api/src/lib/serpapi.ts` |
| **MongoDB Atlas** | Zero-knowledge sync store | `apps/api/src/lib/syncStore.ts` |
| **Sentry** | Spans around every Gemma, SerpApi and TabPFN call (gen_ai attributes, tokens, finish reason) | `apps/api/src/lib/telemetry.ts`, `apps/web/src/lib/telemetry.ts` |
| **GitHub Actions** | CI on every push (counts for the Copilot category's "automate with GitHub Actions" option) | `.github/workflows/ci.yml` |
