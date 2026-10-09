# Deployment guide

## Recommended: Vercel + Supabase

Why: this is a standard Next.js app, API routes are short-lived, and the audio WebSocket goes from the browser straight to Gemini, so no long-running server is needed.

1. **Supabase (production project)**
   - Create a project (pick a region close to your users). Apply `supabase/migrations/20261009000000_init_voice_sessions.sql` (SQL editor, or `supabase link` then `supabase db push`).
   - Authentication → URL Configuration: set **Site URL** to your production URL and add it (and any preview URLs) to **Redirect URLs**.
   - Authentication → Providers → Email: turn **Confirm email** on for production, and decide whether to allow open sign-ups (see the cost warning in the README).
   - Confirm both tables show RLS enabled and run the Supabase security advisor.
2. **Vercel**
   - Import the Git repository (the project root is the app folder). Framework preset: Next.js.
   - Environment variables (Production and Preview):
     - `GEMINI_API_KEY` (mark as sensitive, never prefix with `NEXT_PUBLIC_`)
     - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
     - optional: `GEMINI_LIVE_MODEL`, `MAX_SESSIONS_PER_HOUR`, `EMBED_ALLOWED_ORIGINS`
   - Deploy. The site is served over HTTPS, which the browser requires for microphone access.
3. **Smoke test:** sign up, start a conversation, end it, confirm the session appears with tokens and cost, open its detail page, download the CSV.
4. **Before sharing the URL:** set a budget alert and quota on the Gemini API key in Google AI Studio / Google Cloud, and restrict sign-ups.

## Alternatives

- **Container (Cloud Run, Fly.io, ECS, any VM):** `npm run build` then `npm run start` (Node 22). Provide the same environment variables. Use this route if you later add the phone-line bridge, which needs a long-running process.
- **Netlify / Cloudflare:** possible with their Next.js adapters; not tested here.

## Environment checklist

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Server only. Rotate it if it is ever exposed. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Public key; safety comes from RLS. Never use a service-role key in `NEXT_PUBLIC_*`. |
| `GEMINI_LIVE_MODEL` | no | Default `gemini-3.8-live` |
| `MAX_SESSIONS_PER_HOUR` | no | Default 30 per user |
| `EMBED_ALLOWED_ORIGINS` | no | Space-separated origins allowed to iframe `/embed` |

## Operations notes

- **Cost control:** the per-user hourly cap, a Google-side budget alert, and restricted sign-ups together bound the spend. The dashboard shows estimates, so check Google's billing page for the real figure.
- **Monitoring:** watch server logs for `live-token error` and `session insert error`; the Supabase advisors flag missing RLS and slow queries.
- **Backups and data:** transcripts contain conversation content. Treat the database accordingly (retention, access, privacy notice to users).
- **Keys:** the Gemini key lives only in the host's environment settings. Never commit `.env.local`; it is already in `.gitignore`.
