# AI Voice Agent + Usage & Cost Dashboard

A web app with a real-time voice agent powered by the **Google Gemini Live API**, plus a dashboard that tracks sessions, token/audio usage and **estimated** API cost from the usage data the API actually returns.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · `@google/genai` · Supabase (Postgres + Auth + Row Level Security) · Recharts

## Features

| Area | What it does |
|---|---|
| Voice agent | Speech-to-speech conversation over WebSocket, live transcripts for both sides, interruption handling, start/end controls, status badge, clear errors (mic denied, no mic, token failure, dropped connection, server time limit) |
| Personas | Presets per use case (support, booking, tutor, general) plus free-text system instructions, per session |
| Dashboard | Active/completed sessions, duration, input/output tokens with audio share, thinking tokens, estimated cost per session and running total, daily and weekly charts, recent sessions table, auto-refresh (5 s while a session is live, 30 s otherwise) |
| Logging | Every session stores persona, model, timestamps, status, end reason, raw usage messages, a timestamped transcript and the computed estimate. Session detail page, CSV export and JSON export (with transcripts) |
| Auth | Supabase email/password. Pages redirect to `/login`, API routes return 401, data is protected by Row Level Security |
| Embedding | `/embed` page that can be placed in an `<iframe>` (see [Embedding](#embedding-the-agent)) |

## Architecture

```
 Browser (Next.js client)                          Next.js server (API routes)            Supabase
 ┌───────────────────────────┐   POST /api/live-token   ┌──────────────────────────┐   ┌────────────────────┐
 │ useGeminiLive hook        │ ───────────────────────▶ │ checks login + hourly cap│──▶│ Auth (cookie JWT)  │
 │  • mic → AudioWorklet     │                          │ creates 1-use ephemeral  │   │ voice_sessions     │
 │    (16 kHz PCM)           │ ◀─────── token ───────── │ Gemini token (locked to  │   │ session_usage_events│
 │  • plays 24 kHz PCM reply │                          │ model + persona)         │   │ (RLS: own rows only)│
 │  • transcripts, interrupts│                          └──────────────────────────┘   └────────────────────┘
 │                           │                                      ▲
 │                           │   POST /api/sessions/:id/usage       │ each usageMetadata message
 │                           │   POST /api/sessions/:id/finish ─────┘ server sums usage, computes
 └───────────┬───────────────┘                                        duration + cost estimate
             │ WebSocket (ephemeral token, v1alpha)
             ▼
   Gemini Live API (gemini-3.8-live)
```

Key decisions:

- **The real API key never reaches the browser.** `GEMINI_API_KEY` stays on the server, which mints a short-lived, single-use token locked to one model and one persona. The browser connects to Gemini directly with that token, so audio does not pass through our server and there are no serverless WebSocket limits.
- **Cost is computed on the server** from the stored raw usage messages when a session ends. The browser never supplies a cost or duration.
- **Raw usage is stored exactly as received** (`session_usage_events`), so estimates can be recomputed if prices change.
- **Active sessions are priced live** from the usage messages stored so far, which is what makes the dashboard near-real-time.
- **Abandoned sessions** (tab crash, no end call) are closed out on the next dashboard load at their last known activity.

### File map

| Path | Purpose |
|---|---|
| `src/hooks/useGeminiLive.ts` | The whole voice client: mic capture, playback, transcripts, interruptions, saving |
| `public/pcm-capture-worklet.js` | AudioWorklet that downsamples the mic to 16 kHz PCM |
| `src/lib/liveConfig.ts` | Session config shared by server (token lock) and browser (connect) |
| `src/lib/pricing.ts` | **All cost logic and rates.** Pure functions, unit tested |
| `src/lib/sessions.ts` | Finalising a session (sums usage, computes duration and cost) |
| `src/lib/dashboard.ts` | Dashboard queries and daily/weekly/running-total aggregation |
| `src/lib/personas.ts` | Persona presets |
| `src/app/api/live-token` | Auth check, hourly cap, mints the ephemeral token, creates the session row |
| `src/app/api/sessions/[id]/usage` · `finish` | Store a usage message · close out a session |
| `src/app/api/export` | CSV / JSON export |
| `src/app/sessions/[id]` | Session detail page |
| `src/app/embed` | Embeddable widget |
| `supabase/migrations/` | Database schema and RLS policies |
| `scripts/test-live.mjs` | Terminal check of the Gemini connection, ephemeral token flow and usage data |
| `scripts/test-pricing.mjs` | Unit tests for cost and validation logic |

## Setup (local)

Requirements: Node.js 22+, a Gemini API key, a Supabase project.

1. **Install:** `npm install`
2. **Environment:** `copy .env.example .env.local` (Windows) or `cp .env.example .env.local`, then fill in real values. Never commit `.env.local`.

   | Variable | Where it comes from | Exposed to browser? |
   |---|---|---|
   | `GEMINI_API_KEY` | https://aistudio.google.com/apikey | **No** (server only) |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Yes (public by design) |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API (publishable key) | Yes (public by design, protected by RLS) |
   | `GEMINI_LIVE_MODEL` (optional) | default `gemini-3.8-live` | No |
   | `MAX_SESSIONS_PER_HOUR` (optional) | default 30 per user | No |
   | `EMBED_ALLOWED_ORIGINS` (optional) | origins allowed to iframe `/embed` | No |

3. **Database:** apply `supabase/migrations/20261009000000_init_voice_sessions.sql` to your project (Supabase SQL editor, or `supabase db push` with the CLI).
4. **Auth:** in Supabase → Authentication → Providers → Email, turn **Confirm email** off for local testing (turn it on, or disable sign-ups, before sharing the app. See [Known limitations](#known-limitations)).
5. **Verify the Gemini connection** (no microphone needed): `npm run test:live`. It lists the Live-capable models on your key, then runs a direct connection and an ephemeral-token connection and prints the real usage metadata.
6. **Run:** `npm run dev`, open http://localhost:3000, create an account, press **Start conversation**. Use headphones to avoid echo. Chrome or Edge on `localhost` (microphone access needs HTTPS or localhost).

Other scripts: `npm run typecheck`, `npm run test:pricing`, `npm run build`.

## Cost estimation: what is measured and what is assumed

Token counts come from the `usageMetadata` the Gemini Live API sends with its responses, including per-modality breakdowns (text vs audio). Observed behaviour in our testing:

- `responseTokenCount` is **per turn**; `promptTokenCount` is the **whole context sent for that turn**, so it grows as the conversation grows.
- `thoughtsTokenCount` (thinking) is reported separately and is **not** included in `totalTokenCount`.

Rates (USD per 1M tokens, `gemini-3.8-live`, paid tier) are in `src/lib/pricing.ts`: text in 0.75 · audio in 3.00 · text out 4.50 · audio out 12.00. Source: https://ai.google.dev/gemini-api/docs/pricing, read on 2026-10-09. **Re-check these before relying on them**, then update the rates and bump `PRICING_VERSION`.

Assumptions (also shown in the dashboard footer):

1. Each usage message is one billed generation, and prompt tokens are summed across turns (the context is re-sent each turn). No caching discount is applied, so this may **overstate**.
2. Tokens present in a total but missing from the per-modality breakdown are priced at the higher audio rate (the estimate leans high).
3. Thinking tokens are priced at the text-output rate. We could not find documentation of how Google bills them for Live models.
4. Free-tier usage is billed at zero by Google, but the dashboard still shows the list-price estimate.

All dollar figures are **estimates, not billing data**. Compare with your Google AI Studio / Cloud billing page.

## Embedding the agent

```html
<iframe src="https://YOUR_HOST/embed?preset=support"
        allow="microphone" style="border:0;width:380px;height:520px"></iframe>
```

`preset` is one of `assistant`, `support`, `booking`, `tutor` (see `src/lib/personas.ts`). Only presets are accepted so a link cannot inject arbitrary instructions. Set `EMBED_ALLOWED_ORIGINS` to the sites allowed to frame it; every other page sends `frame-ancestors 'none'`.

**Limitation:** the widget uses the same cookie login as the dashboard. That works on the same site (or sibling subdomains), but browsers block those cookies in cross-site iframes, so a third-party site cannot embed it yet. See future improvements.

### Phone-line integration (not built)

Proposed approach: a telephony provider (for example Twilio Media Streams) streams call audio over WebSocket to a small always-on Node service, which converts 8 kHz µ-law to 16 kHz PCM, relays it to Gemini Live using the server-side key, and converts the 24 kHz reply back. That service would write to the same `voice_sessions` / `session_usage_events` tables, so the dashboard works unchanged. It needs a long-running host (not serverless).

## Extending and maintaining

- **Change or add personas:** edit `src/lib/personas.ts`.
- **Change model:** set `GEMINI_LIVE_MODEL` (run `npm run test:live` to list valid names). If its pricing differs, update `pricing.ts`.
- **Change prices:** edit `RATES_USD_PER_MILLION` and `PRICING_VERSION` in `src/lib/pricing.ts`, run `npm run test:pricing`. Old sessions keep their stored estimate and `pricing_version`; the raw messages let you recompute.
- **Add a stored field:** add a SQL migration under `supabase/migrations/`, then update `lib/sessions.ts` (write) and `lib/dashboard.ts` (read).
- **Change the Live config** (voice, VAD sensitivity, tools): `src/lib/liveConfig.ts` (applies to both token and client).
- **Troubleshooting:** run `npm run test:live` first. If it passes but the browser fails, check the browser console and the red error banner. A "Session limit reached" message means `MAX_SESSIONS_PER_HOUR` was hit.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Verification status (what has and has not been tested)

| Item | Status |
|---|---|
| Dashboard renders locally | Tested by the project owner |
| `npm run test:live`: direct and ephemeral-token Live connections, real usage metadata | Tested by the project owner (both passed) |
| Browser voice conversation: mic → reply audio, both-side transcripts | Tested by the project owner |
| Per-turn usage behaviour (4-turn session) | Observed by the project owner |
| TypeScript typecheck | Passes |
| Cost / validation unit tests (`npm run test:pricing`) | Pass |
| Sign-up / login flow | **Not yet tested** |
| Saving sessions + usage to Supabase, dashboard filled from real data | **Not yet tested** |
| Auto-refresh, session detail page, CSV/JSON export | **Not yet tested** |
| `/embed` widget, frame headers | **Not yet tested** |
| Row Level Security isolation between two users | **Not yet verified.** Manual check: sign up two accounts, create a session in each, confirm each only sees its own in the dashboard and that `/sessions/<other-id>` returns 404 |
| Production build (`npm run build`) and deployment | **Not yet tested** |
| Mobile layout, browsers other than Chrome/Edge | **Not yet tested** |
| `npm audit` (2 reported vulnerabilities) | **Not yet reviewed** |

## Known limitations

- **Anyone who can sign up can spend your Gemini quota.** The per-user hourly cap limits each account, not the number of accounts. Before sharing publicly: disable sign-ups in Supabase after creating the accounts you need, or require email confirmation and add a sign-up allow-list or CAPTCHA.
- **Users can edit their own session rows** (RLS allows updating your own rows), so a determined user could alter their own stored cost. Costs are computed server-side, but this is not tamper-proof. A stricter design would write session totals only through a `security definer` function or a service-role route.
- **Estimates only** (see above). Prices were read from a web page and may change.
- **15-minute audio session cap**: sessions end when the server sends its time-limit notice. Session resumption and context compression are not implemented.
- **Ephemeral tokens are marked experimental** by the SDK and require `apiVersion: 'v1alpha'`.
- **Embedding cross-site does not work yet** (cookie auth); phone integration is a design only.
- **Dashboard aggregation is done in application code** over the latest 1,000 sessions, in UTC day/week buckets. Fine for an MVP, not for large volumes.
- **Transcript timestamps use the browser clock.** Closing the tab mid-session is handled best-effort (`sendBeacon` plus cleanup on the next dashboard load).
- No automated end-to-end or browser tests; only the unit tests listed above.

## Possible future improvements

Session resumption for long calls; anonymous or token-based embedding for third-party sites; telephony bridge; per-organisation accounts and roles; budget alerts and hard spend limits; generated database types; Supabase Realtime instead of polling; SQL views or functions for aggregation at scale; billing reconciliation against Google Cloud billing export.
