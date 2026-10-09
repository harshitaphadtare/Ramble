# Ramble: Hacktoberfest Week 1 build guide

**Challenge:** Hacktoberfest Open-Source AI Challenge, Week 1 ("Touch Grass")
**Deadline:** Sun Oct 11, 11:59 PM PDT, which is **Mon Oct 12, 5:59 PM AEDT** (fixed by DEV; can't be moved)
**What we're building:** Ramble, the personal explore map (places that level up, walks, a private journal), built **from scratch** in this repo and reshaped for the "get people outside" theme
**Shape:** **nothing to download, offline-first, online-enhanced.** It opens like any website, works with no signal, and gets smarter online with open-weight Gemma
**Live:** https://ramble-gw4t.onrender.com

> Technical details live in [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md). This guide covers the **challenge** side: rules, prizes, timeline and the post.

---

## 1. Rules that shape the plan

- **New project only.** The repo must be created and finished between Oct 5 and Oct 11 PDT. This repo's first commit is Oct 8 PDT, so it qualifies.
- **Open-source AI must be the core.** The prompt explicitly allows "an open-weight model, an open-source agent harness or framework, local inference, or any mix". Ramble's AI is **Gemma 4** (open-weight, Apache-2.0), plus **TabPFN** (open-weight).
- **Theme:** get people **outside**. Walks, parks, trails, viewpoints, golden hour and fall colour come first. Cafés are only stops along the way.
- **One entry, one prize.** "One project can enter as many categories as it genuinely uses", but you can win only once. **Every genuine category is an extra chance.**
- **Judging order:** writing quality (weighted most), then relevance, creativity, technical execution and partner tech.
- **Bonus:** take Ramble outside and write about the experience.
- Commits after the deadline must be noted in the README.

---

## 2. Prize categories

### We're entering (each is used for real)

| Category | Prize | How Ramble uses it | Phase |
|---|---|---|---|
| **Gemma** (main target) | $200 | **Gemma 4 26B** on Cloudflare Workers AI ("serving it through … another provider" is explicitly allowed): picks walks and explains why, polishes journal entries on request, summarises trail updates. Guardrails: real places only, validated output, rule-based fallback offline | P1 |
| **Render** | $200 | The whole product runs on Render: one web service serving the PWA **and** the API (auth, end-to-end-encrypted sync, Gemma, TabPFN and SerpApi proxies) | P1–P3 |
| **TabPFN** (Prior Labs) | $200 | **"Places you'll love"**: predicts from your own visit history (anonymous numeric rows) which nearby places you'll love | P2 |
| **SerpApi** | $100 | **Trail and park updates**: fresh closures, works and events for a place before you head out; Gemma summarises them | P2 |
| **MongoDB Atlas** | $100 | Data layer for optional accounts: **end-to-end-encrypted** sync and backup (ciphertext only) plus encrypted photo blobs in GridFS | P3 |
| **Sentry Agent Tracing** | $100 | Traces the AI agent's work: each Gemma call (latency, tokens, retries, validation failures, fallbacks) → TabPFN → SerpApi latency and cache hit rate | P1–P2 |
| **Entire** | $100 | Records our Claude Code build sessions; linked in the post | Throughout |
| **ElevenLabs** | $100 | Narrates the demo video (explicitly allowed: "generate narration for your demo") | Final day |

### Not entering, and why
| Category | Reason |
|---|---|
| Tinker | Fine-tuning: Gemma support unconfirmed, and there isn't time to fine-tune and evaluate properly |
| Arduino (UNO Q) | Needs the hardware |
| DigitalOcean | Same role as Render (and GPU droplets need a card) |
| Backboard | Cloud memory of your history would break the "we can't read your data" promise |
| Tiger Data | Cloud vector search needs plaintext, so the same conflict |
| Mastra, Temporal | Heavy server-side orchestration for what is a few simple, validated AI calls |
| GitHub Copilot | Only if we actually use Copilot (e.g. PR reviews); add it then |

> **About on-device AI:** we built and tested it (Oct 10). Gemma 4 E2B in the browser is a **2 GB download**, and the small 270M model gave unusable output. Asking people to download 2 GB kills adoption, so Gemma runs in the cloud. This is a good, honest paragraph for the post.

---

## 3. The pitch

> *Ramble is your personal explore map. It remembers the places you love, levels them up each time you return, and nudges you outside. There's nothing to install: it opens like a website and keeps working with no signal. When you're online, open-weight Gemma picks your next walk and explains why, TabPFN learns your taste, and Ramble checks for trail closures before you go. If you want, it syncs across your devices, end-to-end encrypted, so even we can't read your memories.*

**Your personal story** goes at the top of the post. It's the strongest thing for "writing quality".

**Why open matters, for Ramble:**
- **No lock-in.** Gemma is open-weight, so we can move hosts (Cloudflare, Google Cloud, our own GPU) or self-host it later without rewriting a single prompt.
- **A provider that doesn't train on your data.** Open weights mean we choose where it runs, and we picked a host whose docs say it doesn't store prompts or train on them.
- **Transparent and inspectable.** Open model, open map data (OSM), open-source app.
- **Cheap enough to be free.** It runs on free tiers today.

---

## 4. What we build, in order

| Phase | Features | Partners shown off |
|---|---|---|
| **P1: Core app** | Map + your places + levels; check-in; quiet background caching for offline use; Explore "Get me outside" (rules instantly, **Gemma** refines when online); walk mode; journal (note + photo, **✨ Polish** with Gemma); streak; encryption on the device; Sentry | Gemma, Render, Sentry |
| **P2: Online enhancements** | Anonymous sessions + rate limits; **places you'll love** (TabPFN); **trail and park updates** (SerpApi + Gemma summary); share links; encrypted backup | TabPFN, SerpApi, Render |
| **P3: Accounts and sync** | Optional sign-up; zero-knowledge keys; recovery key; end-to-end-encrypted sync + photo sync; devices list; delete account | MongoDB Atlas, Render |
| **Final** | Real walk, demo video (ElevenLabs), post | ElevenLabs, Entire |

**Rule:** each phase must be **working and tested** before the next one starts. A smaller app that works beats a big one that breaks during the demo.

---

## 5. Timeline (AEDT)

| When | Work |
|---|---|
| ✅ **Fri Oct 9** | Docs, monorepo scaffold, PWA + MapLibre + Hono API, strict CSP, deployed to Render (free plan) |
| ✅ **Sat Oct 10, early** | On-device Gemma tested and dropped (2 GB); switched to Gemma on Cloudflare Workers AI |
| **Sat Oct 10, day** | Accounts: Cloudflare, Sentry, SerpApi, Prior Labs. P1: Dexie + encryption, places and levels, check-in, Explore with rules + Gemma, journal + ✨ Polish, Sentry tracing |
| **Sat Oct 10, night** | P1: walk mode, streak, background offline caching → **P1 done**. Start P2: sessions + rate limits, trail updates |
| **Sun Oct 11, morning** | P2: TabPFN "places you'll love", share links, backup |
| **Sun Oct 11, midday to afternoon** | P3: Atlas, accounts, vault, recovery key, sync, second-device test |
| **Sun Oct 11, golden hour** | **The real walk.** Use Explore, walk there, check in, write a note, ✨ Polish it. Turn on airplane mode partway to show the map and journal still work. Screen-record it |
| **Sun Oct 11, night** | Fix what the walk exposed, README, **freeze the code** |
| **Mon Oct 12, morning** | Demo video + ElevenLabs narration, Sentry screenshots, write the post |
| **Mon Oct 12, by about 12 PM** | **Publish**, leaving about 6 hours before the 5:59 PM cutoff |

**If P3 isn't solid by Sunday afternoon:** ship P1 + P2, describe sync as "next" in the post, and don't enter MongoDB.

---

## 6. The DEV post (writing is weighted most)

Use the challenge's submission template and the tags `devchallenge` and `hf26challenge`.

**Title idea:** *"I Built a Map That Remembers Where I Love to Wander (and Nudges Me Outside)"*

1. **What I Built.** Your personal story, then the walk, then what Ramble does and who it's for.
2. **Demo.** A ~2-minute video with ElevenLabs narration: open the link (no install) → "Get me outside" → Gemma's picks with reasons → walk → check in, level up → write a note → ✨ Polish → airplane mode, and the map and journal still work → "places you'll love" + a trail-closure alert → sign in on the laptop and the journal appears. Plus the Render link and screenshots.
3. **Code.** Embed the GitHub repo.
4. **How I Built It.**
   - Gemma 4 on Workers AI, called only from the server, with fixed prompts and validated output.
   - Rules-first, AI-second UX, so suggestions appear instantly and Gemma refines them.
   - The on-device experiment: 2 GB vs adoption, and why we chose the cloud.
   - TabPFN on anonymous features.
   - SerpApi with a shared cache, summarised by Gemma.
   - Zero-knowledge sync on Atlas.
   - **Real numbers from Sentry:** Gemma latency, tokens per call, fallback rate.
5. **Why Open Innovation Matters.** No lock-in, our choice of host, transparency, free tiers (§3 above).
6. **Security and privacy.** A short section with the key-derivation diagram: "even a full database breach reveals nothing", and "your journal reaches the AI only when you tap Polish".
7. **My Agent Session.** Entire links.
8. **Prize Categories.** One line each for Gemma, Render, TabPFN, SerpApi, MongoDB Atlas, Sentry, Entire, ElevenLabs on how Ramble uses it. Remove any that didn't ship.
9. **Credits.** OSM contributors, OpenFreeMap, Open-Meteo, Google (Gemma), Cloudflare Workers AI, Prior Labs.

---

## 7. Submission checklist
- [ ] Public repo, MIT licence, README covering setup, architecture, the offline story, security summary and attributions
- [ ] All commits fall within Oct 5–11 PDT; any later ones are noted in the README
- [ ] Live on Render, opens with no install; map, places and journal **work in airplane mode** after normal use
- [ ] Demo shows Gemma suggestions + ✨ Polish, offline use, TabPFN, trail updates, sync
- [ ] Wake the Render free instance a minute before recording (it sleeps after 15 min)
- [ ] Sentry trace screenshots + Entire session links in the post
- [ ] Every listed prize category actually used, with one line on how
- [ ] Post published before **Mon Oct 12, 5:59 PM AEDT**
