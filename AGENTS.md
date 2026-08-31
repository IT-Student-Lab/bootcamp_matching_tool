# AGENTS.md — bootcamp_matching_tool

Instructions for the coding agent working in this repository. Read this fully before writing code.

---

## What this is

A live audience tool for a keynote at the **Construsoft Bootcamp in Kraków on Friday 4 September 2026**, built by JODA AI (Job Sluiter & Daan Verlinden). During a 2–3 minute window in the talk, ~180 people in the room scan a QR code and answer two questions on their phones: what they're good at, and what they'd like to learn. A projected screen shows the answers arriving as points of light and, as an LLM finds genuine matches between people, draws connections and reveals the strongest pairs. Afterwards everyone is emailed their own match.

**This runs once, live, in front of 180 people, and cannot be retried.** That single fact should drive every trade-off you make. Prefer boring and certain over clever and fragile. If you're choosing between an elegant abstraction and something dumb that you can verify works, choose the dumb one.

---

## Read these first, in this order

1. **`docs/technical-plan.md`** — the full specification. Architecture, data model, matching engine design with the arithmetic behind it, prompt text, Resend/DNS setup, build timeline. This is the source of truth for *what* to build and *why the decisions are what they are*.
2. **`docs/mockup.html`** — the visual design, as a working single file. Open it in a browser and click "▶ Simulate live demo". **This is the design source of truth.** It is a mockup with scripted fake data, not production code, but the visual language in it is signed off: colors, type, canvas behaviour, the featured-match card, the mobile form. Port it; don't reinterpret it.
3. **`docs/seed_participants.csv`** — 15 real survey answers to seed the database with.

Section references below (§4.2, §0b, …) point into `docs/technical-plan.md`.

---

## Hard rules

**This repo is public.** Never commit a key, token, password or connection string. `.env*` goes in `.gitignore` in your first commit. All secrets live in Vercel environment variables. If you find a secret in the history, stop and tell Daan rather than force-pushing over it.

**Don't relitigate the settled decisions.** These were argued through and are final:

- Matching is done by **LLM calls, not embeddings**. This is a product decision — the entire point of the segment is demonstrating that AI understands nuance and language across Dutch, Spanish, Polish, Hungarian and English. Cosine similarity would be faster and would undermine the whole talk. Do not "optimise" this.
- Matching runs in **timed rounds (~7s), one LLM call per round**, not one call per arriving person. §4.1–4.2 has the arithmetic; per-arrival was measured at 8× the tokens and produces bad matches early in the window when the pool is small.
- The **`/admin` page drives the round clock** via `setInterval`. Not a Supabase webhook (at-least-once delivery causes duplicate matches), not Vercel Cron (1-minute minimum granularity, far too slow).
- Use **`claude-sonnet-4-5`** for the live rounds, not Haiku. Batching cut the call count ~9×, which makes ~21 Sonnet calls cost about $0.40 for the whole event. Match quality is the product here.
- Connect to Supabase via **`@supabase/supabase-js` over HTTPS**, never direct Postgres on 5432 from a serverless function (connection exhaustion under a submission burst).

**Don't change the visual design without asking.** Fonts, the cream/lime palette, the canvas treatment and the reveal card come from the Construsoft Bootcamp house style and match the PowerPoint the talk runs on. Improve the *code*; leave the *look* alone.

**Ask Daan, don't guess**, about: anything on stage (timings, what Job says, what appears when), the wording of what the audience reads, and anything touching attendees' personal data beyond what the plan already specifies. Decide yourself, without asking: file layout, component structure, styling implementation, library choices within the constraints above, test approach.

---

## Stack

Next.js (App Router) on Vercel · Supabase (Postgres + Realtime) · Anthropic API · Resend. TypeScript.

```
/                      mobile form (public)
/screen                projected live screen (public URL, but not advertised)
/admin                 operator panel (password-gated)
/api/submit            POST — validate + insert a live participant
/api/match-round       POST — one matching round (§4.4)
/api/finalize-matches  POST — closing sweep + global assignment (§4.5)
/api/send-results      POST — batch send result emails (§6)
/scripts/seed.ts       import docs/seed_participants.csv
/scripts/loadtest.ts   fire N synthetic submissions at /api/submit
```

Environment variables: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, `ADMIN_PASSWORD`, `MATCH_SCORE_FLOOR` (default 70).

---

## Build order

Work in this sequence and get each milestone genuinely working before starting the next. Commit at each checkpoint.

**M1 — Data layer.** Run the SQL from §10. Write `scripts/seed.ts` and import the 15 seed rows with `source='seed'`. Verify in the Supabase dashboard that RLS actually blocks anonymous reads of `participants` (try it with the anon key — don't assume the policy works because you wrote it).

**M2 — Form → database.** Build `/` and `/api/submit`, styled from the mockup. Submit from an actual phone, not just a desktop browser at 375px. Check the confirmation state.

**M3 — Matching.** Build `/api/match-round` and the round clock on `/admin`. **This is the heart of the tool — budget accordingly.** Test it against the 15 real seed answers before anything synthetic: they contain the hard cases (see §0b), and you should see roughly the matches listed there. If Sasja↔Yhore doesn't come out near the top, the prompt is wrong.

**M4 — Screen.** Port the mockup's canvas to real Realtime data. The reveal queue (§5.2) is part of this milestone, not a polish item.

**M5 — Finalize + email.** `/api/finalize-matches` including the greedy global assignment in code (§4.5 stage 2 — do not ask the LLM to do the assignment), then the Resend batch send.

**M6 — Hardening.** The load test, the fallback demo mode, the rehearsal fixes.

---

## Things that will bite you

**A fixed 88% threshold for the featured reveal is a trap.** If the real answers top out at 82, nothing is ever featured and the screen is dead during the most important two minutes of the talk. Rank, don't gate: the queue always pops the highest-scoring unshown match above a floor (env var, default 70), and the card shows whatever the real number is. §5.2.

**Seed rows and live rows are separate people-records for the same humans.** The audience is asked to answer live even if they already did the survey — that's deliberate staging. So a seeded person can submit again, and you must (a) supersede their seed row, (b) never let the matcher pair someone with themselves via `person_key`, (c) prefer live-involving matches in the reveal queue. §0b.5. When name-matching is ambiguous, **do not merge** — a duplicate node is far cheaper than wrongly merging two people.

**Never let an error reach the projector.** Build in production mode; no dev overlays. If Realtime drops, the screen keeps rendering what it already has and reconnects silently — a connection problem shows as a small dot in a corner, never a banner, never a red screen. Wrap the canvas in an error boundary that fails to "keep showing the last good frame".

**The screen runs fullscreen on an unfamiliar laptop and projector.** Handle devicePixelRatio properly, test at 1920×1080 and 16:9, add a fullscreen shortcut, hide the cursor after a few seconds of no movement. No scrollbars, ever.

**`/api/match-round` must be serialised.** Two overlapping rounds will double-match. Take the lock in the `runs` table and return early if a round is in flight. Also: never throw a 500 out of the round handler — log, skip, return 200. A missed round is invisible; a crash loop is not.

**The form must work on old phones.** iOS Safari, Android Chrome, a five-year-old device on venue wifi. No bleeding-edge CSS, no huge JS bundle. Test on a real phone over a mobile connection before Thursday.

**Cold starts.** Ping `/api/match-round` a minute before the segment so the first real round doesn't eat a 2s cold start.

---

## Definition of done

Not "the code is written" — this:

- [ ] 60 synthetic submissions fired at `/api/submit` in 90 seconds; the screen keeps up, rounds don't overlap, the reveal queue paces sensibly and nothing looks frantic.
- [ ] Round latency measured and visible on `/admin`.
- [ ] Matching produces sane results **on the 15 real seed answers**, including honestly returning nothing for the vague ones.
- [ ] Nobody is ever matched with themselves, across the seed/live split.
- [ ] A test result email lands in a Gmail **and** a Microsoft 365 inbox, not spam.
- [ ] Fallback demo mode works with the network fully disconnected.
- [ ] A full rehearsal has been run end-to-end, ideally on venue wifi.
- [ ] A one-page operator sheet exists for Job and Daan: which buttons, in what order, and what to do if the screen freezes.

---

## Working with Daan

Short, concrete updates at each milestone with a link to what you built, not a summary of what you did. When you hit an ambiguity that's genuinely a staging or product decision, ask — he's presenting this and has context you don't. When it's a technical decision within the constraints above, just make it and mention it.

If you fall behind the timeline in §12, say so early. There is a defined fallback (the demo mode) but it needs to be a decision, not a discovery on Friday morning.
