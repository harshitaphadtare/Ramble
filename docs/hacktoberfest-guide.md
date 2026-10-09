# Ramble: Hacktoberfest Week 1 build guide

**Challenge:** Hacktoberfest Open-Source AI Challenge, Week 1 ("Touch Grass")
**Deadline:** Sun Oct 11, 11:59 PM PDT, which is **Mon Oct 12, 5:59 PM AEDT** (fixed by DEV; can't be moved)
**What we're building:** Ramble, the personal explore map (places that level up, walks, a private journal), built **from scratch** in this repo and reshaped for the "get people outside" theme
**Shape:** **offline-first, online-enhanced.** Gemma runs on the phone; online features make it smarter

> Technical details live in [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md). This guide covers the **challenge** side: rules, prizes, timeline and the post.

---

## 1. Rules that shape the plan

- **New project only.** The repo must be created and finished between Oct 5 and Oct 11 PDT. This repo's first commit is Oct 8 PDT, so it qualifies.
- **Open-source AI must be the core.** Gemma (open weights, running on the device) is what makes Ramble work. TabPFN is also open-weight.
- **Theme:** get people **outside**. Walks, parks, trails, viewpoints, golden hour and fall colour come first. Cafés are only stops along the way.
- **One entry, one prize.** "One project can enter as many categories as it genuinely uses", but you can win only once. **Every genuine category is an extra chance.** Shallow, box-ticking use won't win.
- **Judging order:** writing quality (weighted most), then relevance, creativity, technical execution and partner tech.
- **Bonus:** take Ramble outside and write about the experience.
- Commits after the deadline must be noted in the README.

---

## 2. Prize categories: all 16 reviewed

### We're entering (each is used for real)

| Category | Prize | How Ramble uses it | Phase |
|---|---|---|---|
| **Gemma** (main target) | $200 | Gemma 4 E2B **on the phone**: picks walks and explains why, turns voice, photos and notes into journal entries, summarises trail updates. Works with zero bars | P1 |
| **Render** | $200 | The whole product runs on Render: one web service serving the PWA **and** the API (auth, end-to-end-encrypted sync, partner proxies) | P1–P3 |
| **TabPFN** (Prior Labs) | $200 | **"Places you'll love"**: predicts from your own visit history (anonymous numeric rows) which nearby places you'll love | P2 |
| **SerpApi** | $100 | **Trail and park updates**: fresh closures, works and events for a place before you head out; Gemma summarises them | P2 |
| **MongoDB Atlas** | $100 | Data layer for optional accounts: **end-to-end-encrypted** sync and backup (ciphertext only) plus encrypted photo blobs in GridFS | P3 |
| **Sentry Agent Tracing** | $100 | Traces the whole AI path: Gemma on the device (load, time to first token, tokens/s, fallbacks) → TabPFN → SerpApi latency and cache hit rate | P1–P2 |
| **Entire** | $100 | Records our Claude Code build sessions; linked in the post | Throughout |
| **ElevenLabs** | $100 | Narrates the demo video (explicitly allowed: "generate narration for your demo") | Final day |

### Not entering, and why
| Category | Reason |
|---|---|
| Tinker | Fine-tuning: Gemma support unconfirmed, and making it work in the browser is a separate project |
| Arduino (UNO Q) | Needs the hardware |
| DigitalOcean | Same role as Render |
| Backboard | Cloud memory of your history would break the "we can't read your data" promise |
| Tiger Data | Cloud vector search needs plaintext, so the same conflict |
| Mastra, Temporal | Server-side agent orchestration; Ramble's agent runs on the phone |
| GitHub Copilot | Only if we actually use Copilot (e.g. PR reviews); add it then |

> Free credits for Render, Tinker, Backboard and ElevenLabs are at **hacktoberfest.com/my/promos**. Claim the Render and ElevenLabs ones first.

---

## 3. The pitch

> *Ramble is your personal explore map. It remembers the places you love, levels them up each time you return, and nudges you outside, even with zero bars. Gemma runs on your phone. When you're online, Ramble learns your taste (TabPFN) and checks for trail closures (SerpApi). If you want, it syncs across your devices, end-to-end encrypted, so even we can't read your memories.*

**Your personal story** goes at the top of the post. It's the strongest thing for "writing quality".

---

## 4. What we build, in order

| Phase | Features | Partners shown off |
|---|---|---|
| **P1: Core offline app** | Map + your places + levels; check-in; "Get ready for offline"; Explore "Get me outside" (Gemma); walk mode; journal from voice, photo or text (Gemma); streak; encryption on the device; Render deploy; Sentry | Gemma, Render, Sentry |
| **P2: Online enhancements** | API on Render; anonymous sessions; **places you'll love** (TabPFN); **trail and park updates** (SerpApi + Gemma summary); share links; encrypted backup | TabPFN, SerpApi, Render |
| **P3: Accounts and sync** | Optional sign-up; zero-knowledge keys; recovery key; end-to-end-encrypted sync + photo sync; devices list; delete account | MongoDB Atlas, Render |
| **Final** | Real walk, demo video (ElevenLabs), post | ElevenLabs, Entire |

**Rule:** each phase must be **working and walk-tested** before the next one starts. A smaller app that works beats a big one that breaks during the demo.

---

## 5. Timeline (AEDT)

The deadline is fixed, so this is the order to put the hours in.

| When | Work |
|---|---|
| **Fri Oct 9, tonight** | Claim the promos; set up Entire; create the Atlas, Prior Labs, SerpApi, Resend and Sentry accounts (2FA on). Scaffold the monorepo, Vite PWA, Hono API and MapLibre; deploy to Render. **Gemma spike on the iPhone.** |
| **Sat Oct 10, morning to afternoon** | P1: Dexie + encryption, places and levels, check-in, offline wizard, Explore with Gemma, Sentry. |
| **Sat Oct 10, evening to night** | P1: walk mode, journal (voice, photo, text) → **P1 done**. Start P2: anonymous sessions, SerpApi trail updates. |
| **Sun Oct 11, morning** | P2: TabPFN "places you'll love" (seed it with your real history). Share links and backup if there's time. |
| **Sun Oct 11, midday to afternoon** | P3: accounts, vault, recovery key, sync, photo sync, second-device test. |
| **Sun Oct 11, golden hour** | **The real walk in airplane mode.** Screen-record it; save a journal entry in the app. Then turn data back on and show sync + trail updates. |
| **Sun Oct 11, night** | Fix what the walk exposed, README, **freeze the code**. |
| **Mon Oct 12, morning** | Demo video + ElevenLabs narration, Sentry screenshots, write the post. |
| **Mon Oct 12, by about 12 PM** | **Publish**, leaving about 6 hours before the 5:59 PM cutoff. |

**If P3 isn't solid by Sunday afternoon:** ship P1 + P2, describe sync as "next" in the post, and don't enter MongoDB. A half-working sign-in costs more points than it earns.

---

## 6. The DEV post (writing is weighted most)

Use the challenge's submission template and the tags `devchallenge` and `hf26challenge`.

**Title idea:** *"I Touched Grass With Zero Bars: Ramble, a Personal Explore Map Where the AI Lives on Your Phone"*

1. **What I Built.** Your personal story, then the airplane-mode walk, then what Ramble does and who it's for.
2. **Demo.** A ~2-minute video with ElevenLabs narration: the offline-ready screen → airplane mode on → Gemma suggestion → walk → voice note becomes a journal entry → data back on → "places you'll love" + trail update → sign in on the laptop and the journal appears. Plus the Render link and screenshots.
3. **Code.** Embed the GitHub repo.
4. **How I Built It.**
   - Gemma 4 E2B in the browser, with the model chosen to fit the device.
   - The "ids only" guardrail.
   - TabPFN on anonymous features.
   - SerpApi with a shared cache, summarised by Gemma.
   - Zero-knowledge sync on Atlas.
   - **Real numbers from Sentry:** load time, time to first token, tokens/s on the iPhone vs the laptop, API latency.
5. **Why Open Innovation Matters.**
   - A closed API can't run on a trail with no signal.
   - Open weights let your memories stay on your phone.
   - You can swap models (270M vs E2B) to fit the device.
   - TabPFN is open-weight too.
   - The map and place data are open (OSM).
6. **Security and privacy.** A short section with the key-derivation diagram: "even a full database breach reveals nothing". Judges notice this.
7. **My Agent Session.** Entire links.
8. **Prize Categories.** One line each for Gemma, Render, TabPFN, SerpApi, MongoDB Atlas, Sentry, Entire, ElevenLabs on how Ramble uses it. Remove any that didn't ship.
9. **Credits.** OSM contributors, OpenFreeMap, Open-Meteo, Google (Gemma, LiteRT-LM), Hugging Face, Prior Labs.

---

## 7. Submission checklist
- [ ] Public repo, MIT licence, README covering setup, architecture, the offline story, security summary and attributions
- [ ] All commits fall within Oct 5–11 PDT; any later ones are noted in the README
- [ ] Live on Render; installable; **works in airplane mode** after "Get ready for offline"
- [ ] Demo shows airplane mode, Gemma with no signal, TabPFN, trail updates, sync
- [ ] Sentry trace screenshots + Entire session links in the post
- [ ] Every listed prize category actually used, with one line on how
- [ ] Post published before **Mon Oct 12, 5:59 PM AEDT**
