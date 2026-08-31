# Live Matchmaker — Technical Plan v3
### Construsoft Bootcamp Kraków 2026 · JODA AI · "The Live Matchmaker" (script Deel 2, 19:30–30:00)
**Event: Friday 4 September 2026.** Status: spec ready to hand to a coding agent.

> **v3 changes:** the 15 real survey answers are now analysed (§0b) and change three things — the matching prompt gains worked examples for the "everybody wants AI, nobody supplies it" problem, the form copy is rewritten to stop inviting unmatchable one-word answers, and submit now upserts on email. **v2 changes:** matching engine redesigned from per-arrival calls to round-based batching (§4).

---

## 0. Read this first: the pool, the seed data, and what it tells us

**15 real answers now exist** (`Survey results Construsoft.xlsx`) and should be seeded into the database before the event — see §0b for what they contain and what they cost us. But 15 is thin: the arguments below for pre-filling further still stand in full.

The script says, at the QR moment:

> *"A few weeks ago we asked you two questions. What are you good at and what would you like to learn. **Many of you answered.** If you have not yet — the code is on the screen."*

With only 15 answers in the bank the room effectively still starts near **zero**, and that line is a stretch as written. This matters far beyond honesty:

- **Matching quality is a function of pool size.** The first person to submit can be matched against nobody. The tenth against nine people. Good matches only become findable once there are enough people to find them among — and the segment is only 2–3 minutes long.
- **The screen is empty exactly when Job points at it.** The first 30–45 seconds of the most visual moment in the talk would show a nearly blank canvas and no matches.
- **The "94% match" reveal needs a full pool to be real.** Early-window scores will genuinely be mediocre, and the honest thing for the model to do is return nothing.

**Strong recommendation: open the form 2–3 days before the event** and push it by email/Teams to the attendee list. Aim for 60–100 answers in the bank before anyone walks into the room. Then:

- The script's line becomes true again, word for word.
- The live window becomes what it should be — the room *topping up* an already-living network, with new lights landing on a canvas that's already glowing.
- Every live arrival is matched against a rich pool from the first second, so the featured reveals are strong from the start.
- The failure mode of "nobody scans the QR fast enough" disappears entirely.

If pre-filling is impossible, the fallbacks are: open the form at registration/coffee that morning, or accept a deliberately slow first 45 seconds and have Job cover it with the Sasja/Yhore story (which he's doing anyway). But pre-filling is by far the cheapest risk reduction available, and it costs one email.

---

## 0b. What the 15 real answers tell us (and what has to change because of it)

The seed file has three columns: `invitee_name`, "what are you genuinely good at", "what would you like to learn". Five findings, in order of how much they change the build.

### 1. "AI" is 47% of demand and 0% of supply

Seven of fifteen people named AI as what they want to learn (David, Cristina, Emilia, Lilla, Dominik, Marcin, George). **Nobody listed AI as something they're good at.**

- **Good news for the script:** the line *"half of the people who answered wrote down the same thing… It was AI"* is literally, verifiably true. 47%. That line is safe.
- **Bad news for the matcher:** the single biggest demand in the room has no supply. A keyword matcher would return nothing for half the audience and the segment would die on stage.
- **The fix is in the prompt, and it works.** Matching on the *underlying need* instead of the word finds real pairs. Two from the actual data:
  - **Lilla (HU)** wants *"AI and automation to reduce administrative work in sales and internal processes"* ↔ **Steven (NL)** is good at *"seeing relationships in processes and suggesting steps to optimize with automation or avoiding extra manual work."* Neither mentions the other's vocabulary. It's a strong match.
  - **Dominik (PL)** wants *"AI agents that create content for e-learning"* ↔ **Igor (PT)** is good at *"finding what should be explained in workflows that is usually missing from user manuals and training material."* Also strong.
  
  Both examples belong in the prompt as worked examples (§4.7) — they teach exactly the behaviour the segment needs to demonstrate.

### 2. Vague answers are unmatchable, and the current question invites them

"AI use", "Topic: AI", "Azure", "Usage of any AI tools", "Programming" — nothing to match on. Four of fifteen answers are effectively dead weight.

**Change the form copy** (§5.1). The second question needs a nudge toward the task, not the technology, plus a soft minimum length. See §5.1 for the exact wording.

### 3. Answers are twice as long as the v2 estimate — batching matters more, not less

Measured: mean 253 characters across both answers, max 396 for a single answer. That's **~78 tokens per roster row**, not the 40 the v2 arithmetic assumed.

| At 180 people | Design A (per arrival) | Design B (rounds) |
|---|---|---|
| Input tokens | ~1,300,000 | ~163,000 |
| Peak ITPM | ~519,000 (**26% of the 2M ceiling**) | ~65,000 (3.3%) |

Design A still technically fits, but a quarter of the ceiling on real data — with no headroom for a retry storm — is not where you want to be during a live keynote. Design B stays at 3%. The round-based design is confirmed.

### 4. Two columns are missing: country and email

The survey captured neither. Both are needed — country for the screen's tags, email for the results. A prepared seed CSV with a best-guess country column is provided; **verify the countries and add the emails before import.** If the emails can't be found, those 15 simply get invited to the form like everyone else and the seed is used for the screen only.

### 5. Seed and live are separate — and a seeded person submits again on the day

The audience is asked to answer live **even if they already filled in the survey weeks ago**. That is a deliberate staging choice: the room has to participate, not be told it already participated. So seed rows and live rows are two different things and the schema has to say so.

- `participants.source` is `'seed'` or `'live'`.
- Seed rows are in the matching pool **from t=0**, so the screen has depth before the first phone submits and early live arrivals are matched against a real room rather than an empty one.
- When a seeded person submits live, the **live row supersedes the seed row**: set `superseded_by` on the seed row, and drop its node from the screen. This gives honest counts, avoids two lights for one human, and lets the fresher answer win — which matters, because live answers are written against the improved question copy (§5.1).
- **A person must never be matched with themselves.** Link the two rows via a `person_key` (normalised, lowercased, accent-stripped name; email once the seed emails are filled in) and exclude same-`person_key` pairs in the matcher. With only 15 seed rows this is a lookup against a known list, so keep it conservative: **when in doubt, do not merge** — a duplicate node is a much cheaper mistake than wrongly merging two different people.
- Within `source='live'`, still upsert on lowercased email so someone fixing a typo doesn't appear twice.

**Screen consequence:** the featured-reveal queue should *prefer* matches involving at least one `source='live'` row, falling back to any match when there aren't enough. The segment has to feel like it is happening now, even though the seed is doing quiet work underneath.

### What the matcher would actually produce on these 15

Worked through by hand, the honest output is roughly five solid matches and five people with nothing:

| Match | Score | Note |
|---|---|---|
| Sasja (NL, analysis/statistics) → Yhore (ES, wants Power BI + sales data analysis) | ~92 | **The slide-25 guarantee match — independently confirmed by the data.** |
| Steven (NL, process automation) → Lilla (HU, wants AI to cut admin work) | ~90 | AI demand met by a non-AI strength |
| Lilla (HU, structure/aligning people) → Bart (NL, wants project & people management) | ~87 | |
| Lilla (HU) → Álvaro (ES, wants to lead and motivate a team) | ~85 | **Two demanders, one supplier — the global-assignment problem, live** |
| George (GR, listening/working with people) → Raquel (ES, wants communication skills) | ~80 | |
| Igor (PT, spotting gaps in training material) → Dominik (PL, wants AI for e-learning content) | ~76 | |
| Marcin, Daniël, David, Cristina, Emilia | — | no honest match: vague answers, or a skill nobody in this set demands |

Two things to take from that. **The Sasja/Yhore match in the deck is real** — the tool finds it on its own, so slide 25 is safe. And **~40% coverage at n=15 is exactly why the pool size argument in §0 matters**; coverage climbs steeply with more people, because supply broadens.

---

## 1. What this tool has to do

Two screens, one shared backend:

1. **Mobile form** — attendees scan a QR code, answer two questions ("I'm good at —", "I'd like to learn —") plus first name, country and email. Under a minute. Live during the 2–3 minute window while Job tells the Sasja/Yhore story, and (per §0) ideally already open for days beforehand.
2. **Live screen** — projected during and after that window. Every answer is a point of light; matches draw a pulsing line; strong matches are **automatically** pulled into a featured reveal (score first, then names). No clicker.

Afterwards everyone gets **their own best match by email** during the break.

### Decisions locked in

- Language of the answers is irrelevant — Dutch, Spanish, Polish, Hungarian, English. Handled by genuine understanding, not per-language rules.
- **No opt-in group.** Everyone who submits is eligible. Nobody is asked to stand up.
- **Matching is real LLM reasoning, not embeddings.** Deliberate narrative choice: the segment exists to demonstrate that AI understands nuance and language. §4 is how that's made fast enough to feel live.
- Personal results by **email** (not reply.live — no data hookup yet).
- Stack: **Supabase** (Postgres + Realtime) + **Vercel** (hosting + functions) + **Anthropic API** (matching) + **Resend** (email).
- The featured reveal is threshold-triggered, not clicker-driven, with a manual override for the operator (§5.3).

---

## 2. Architecture

```
[Attendee's phone]                        [Big screen laptop]        [Operator laptop]
   Form page (Vercel)                      /screen (Vercel)            /admin (Vercel)
        |  POST /api/submit                     ^                          |
        v                                        | Supabase Realtime       | drives the clock:
  ┌──────────────────── Supabase ────────────────┴───────────┐             | POST /api/match-round
  │  Postgres: participants, matches, matches_public (view)  │             | every ~7s
  │  RLS: anon may INSERT participants; anon may SELECT      │<────────────┘
  │  matches_public only. No anon read of raw participants.  │
  └──────────────────────────┬───────────────────────────────┘
                              v
                   Vercel function /api/match-round
                   (serialised, one round at a time)
                              |
                              v
                   Anthropic API — ONE call per round
                   (N new arrivals × full current roster)
                              |
                              v
                   INSERT INTO matches ──► Realtime push to /screen
```

Plus two operator-triggered functions: `/api/finalize-matches` (§4.5) and `/api/send-results` (§6).

---

## 3. Why not a Claude Artifact, and why not embeddings

**Not an Artifact:** a published Artifact page cannot make outbound network calls (fetch/XHR/WebSocket) except to load scripts from a couple of whitelisted CDNs — no database, no Anthropic API. Its only shared-state primitive is republishing the whole document, which is fine for a poll and useless for 180 phones submitting at once. Hard platform limit.

**Not embeddings:** an explicit product decision, not a technical one (§1).

---

## 4. The matching engine (redesigned)

### 4.1 Is 180 live LLM calls actually feasible? — the honest arithmetic

v1 proposed one call per new arrival: person #k is compared against the k−1 people already in the room. Measured against the real constraints:

| | Design A (per arrival) | Standard Anthropic limit |
|---|---|---|
| Calls | 180 | — |
| Peak RPM (180 in 2.5 min) | ~72 | 1,000 |
| Total input tokens | ~680,000 | — |
| Peak ITPM | ~272,000 | 2,000,000 |
| Peak OTPM | ~18,000 | 400,000 |
| Cost (Haiku) | ~$0.91 | — |

So on **standard** rate limits, 180 calls in a few minutes does fit — comfortably, with roughly 10× headroom on every axis. The naive fear ("we'll be rate limited") is unfounded *if* the account is on standard limits.

**The one real rate-limit risk:** Anthropic's docs note that *new organisations may start in an "Evaluation" tier with limits below standard* while account history is established. That is the single pre-flight check that actually matters — see §9.1. Everything else about rate limits is fine.

**But the design is still wrong, for five reasons that have nothing to do with rate limits:**

1. **Match quality collapses at the start.** Person #4 is compared against 3 people. Person #10 against 9. The model will honestly return "no good match" for most of the first 30–45 seconds — precisely when the screen is the show. This is the real problem, and it's a dramaturgy problem, not a compute one. (§0 is the primary mitigation; batching is the secondary one.)
2. **Token cost is quadratic, not linear.** 180 calls each carrying a growing roster = **16,110 roster rows rendered**, ~680k input tokens. It works at 180 people; it's simply 8× more than needed.
3. **Thundering herd.** 180 near-simultaneous serverless invocations, each doing a full-table roster SELECT, each paying a 1–2s cold start. Supabase database webhooks are at-least-once, so retries produce duplicate matches unless you add idempotency.
4. **The screen floods.** At peak the engine produces matches faster than a human can watch them. A featured reveal needs ~6s on screen plus a gap; over a 3-minute segment that is **~24 reveals maximum**. Anything beyond that is wasted work that also risks the screen looking frantic.
5. **No global view.** Per-arrival matching has no idea that one popular person has already been matched to twenty others while eight people have been matched to nobody. The result emails become unfair and repetitive.

### 4.2 The redesign: round-based batching

Replace "one call per person" with **one call per round**, where a round is every ~7 seconds:

- Collect everyone who arrived since the last round (typically 5–15 people).
- Make **one** Anthropic call containing those new arrivals *plus the full current roster*, asking for the best matches for each new arrival among everyone.
- Insert the resulting matches. Realtime pushes them to the screen.

| | Design A (per arrival) | **Design B (rounds)** | Improvement |
|---|---|---|---|
| Calls across the event | 180 | **~21** | 9× fewer |
| Total input tokens | ~680,000 | **~88,000** | 7.8× fewer |
| Peak RPM | ~72 | **~8** | — |
| Peak ITPM | ~272,000 | **~35,000** | — |
| Cost on Haiku | ~$0.91 | **~$0.14** | — |
| Cost on **Sonnet** | ~$12 | **~$0.42** | — |

**The valuable consequence:** because batching cuts the call count by 9×, you can afford a **materially smarter model**. Twenty-one Sonnet calls cost about forty cents total. For a three-minute showpiece whose entire premise is "look how well AI understands nuance across languages", pay the forty cents — use **Sonnet for the live rounds**, not Haiku. Quality per call matters enormously here and volume is trivial. Drop to Haiku only if measured round latency turns out to hurt.

**Latency per round** is ~5–10s (one call, a few hundred output tokens). That reads on screen as matches arriving in *waves* rather than a nervous trickle — which is better theatre, not worse. Job is talking over it either way.

**Prompt caching:** order the roster stably (by `created_at`) and append only. The roster prefix is then byte-identical between rounds, so mark it with a cache breakpoint — cached input tokens don't count toward ITPM at all and are much cheaper. Worth doing; not load-bearing at this scale.

### 4.3 Who drives the clock

Not a Supabase webhook (fan-out, at-least-once retries) and not Vercel Cron (1-minute minimum granularity — far too slow). Instead **the `/admin` page drives the rounds**: a `setInterval` that POSTs `/api/match-round` every ~7 seconds while a "matching live" toggle is on. Simple, visible, and instantly stoppable from the stage. The screen stays dumb and read-only, which is what you want from the thing that's projected.

Server-side, `/api/match-round` takes a lock (a row in a `runs` table, or a simple `status` flag) so two rounds can never overlap.

### 4.4 Round logic

```
POST /api/match-round
  if a round is already running: return {skipped: true}
  newArrivals = SELECT * FROM participants WHERE status = 'new' ORDER BY created_at
  if newArrivals is empty: return {skipped: true}

  roster = SELECT id, first_name, country, good_at, wants_to_learn, person_key
           FROM participants
           WHERE superseded_by IS NULL                  -- seed rows whose person came back are out
           ORDER BY created_at                          -- stable prefix for caching

  # Don't burn the good reveals on a thin pool (see §0)
  if roster.length < 15 AND secondsSinceFirstArrival < 30: return {waiting: true}

  result = anthropic.messages.create(
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      messages: [{role: "user", content: buildRoundPrompt(newArrivals, roster)}]
  )
  parsed = parseStrictJSON(result)

  for m in parsed.matches:
      if m.score < 60: continue
      if personKey(m.teacher_id) == personKey(m.learner_id): continue   # never self-match (§0b.5)
      if pairAlreadyExists(m.a, m.b): continue                          # idempotency, see 4.6
      INSERT INTO matches (participant_a, participant_b, score, reason)
        VALUES (m.teacher_id, m.learner_id, m.score, m.reason)
      # note: no `featured` flag written here — the screen ranks the queue itself (§5.2)

  UPDATE participants SET status = 'matched' WHERE id IN newArrivals
```

### 4.5 Closing sweep — `/api/finalize-matches`

Triggered from `/admin` once the window closes. Two stages:

**Stage 1 — fill the gaps.** For everyone still without a decent match, run the same batched rounds against the now-complete roster, in chunks of ~20 people per call (≈9 calls for 180 people). This is what rescues the early arrivals, who were matched against a nearly empty room.

**Stage 2 — global assignment, in code, not by the LLM.** Take every candidate pair with its score and run a greedy maximum-weight assignment (sort pairs by score descending; accept a pair if neither person already has a primary match; repeat; then a second pass allowing seconds for anyone still unmatched). Mark the winners `is_final = true`. This is what guarantees:

- every person gets exactly one primary match to email,
- no popular person hogs twenty matches,
- nobody gets nothing.

Do not ask the model to do this — it's a solved combinatorial problem and code does it exactly, instantly, and reproducibly. Runs during the break; no time pressure.

### 4.6 Guardrails

- **Idempotency:** add `create unique index on matches (least(participant_a::text, participant_b::text), greatest(participant_a::text, participant_b::text));` so the same pair can never be inserted twice regardless of retries.
- **Parse defensively:** strip markdown fences, `JSON.parse` in try/catch, on failure log and skip. A missed round is survivable; a 500 that breaks the form is not.
- **Validate ids** against the roster actually sent; drop hallucinated ids.
- **Clamp scores** 0–100; drop <60 even if the model ignores the instruction.
- **Junk-answer pre-filter:** skip matching (but still store the row) if either answer is under ~4 characters after trimming.
- **Warm-up:** ping `/api/match-round` once a minute or two before the segment so the function is warm and the first real round doesn't eat a cold start.

### 4.7 Round prompt

```
You are matching colleagues at a company bootcamp by what they're good at and what they want to learn.
Answers arrive in many languages (Dutch, Spanish, Polish, Hungarian, English, others).
Read past the language to the actual skill or topic underneath.

THE ROOM (id · name · country · good at · wants to learn)
{full roster, one compact line per person, stable order}

MATCH THESE NEW ARRIVALS
{new arrivals, same format}

For each new arrival, find the single best match in the room — someone who wants to learn what this
person is good at, or is good at what this person wants to learn.

MATCH ON THE UNDERLYING NEED, NOT ON SHARED WORDS. Many people will write "AI" as what they want to
learn, and almost nobody writes "AI" as a strength. The right match is the person who can actually
help with the task behind the word. Two real examples:

  - Wants "AI and automation to reduce administrative work in sales and internal processes"
    matches someone good at "seeing relationships in processes and suggesting steps to optimize
    with automation or avoiding extra manual work" — neither uses the other's vocabulary, and it
    is still an excellent match.
  - Wants "AI agents that create content for e-learning" matches someone good at "finding what
    should be explained in workflows that is usually missing from user manuals and training
    material."

Conversely, do not match two people just because both wrote the word "AI". Wanting the same thing
is not a match — one of them has to be able to help the other.

Be honest and be strict. If there is no genuine match for someone, leave them out entirely.
A forced match shown on a big screen is worse than no match. Some answers are too vague to match
("AI", "programming", "Azure") — leaving those people out is the correct behaviour, not a failure.
Score 0-100 for how good the match really is; only return 60 or above.
reason: one short sentence, plain English, specific to what these two people actually wrote.
Never generic ("both interested in learning"). Name the actual overlap.

Respond with ONLY this JSON, no other text:
{"matches": [{"teacher_id": "...", "learner_id": "...", "score": 0-100, "reason": "..."}]}
```

---

## 5. Frontend

### 5.1 Form (`/`)
Fields: first name, country (§8), "I'm good at —", "I'd like to learn —", email, one consent line (§7). Big tap targets. See the mockup's "Mobile form" tab.

**Question copy — changed based on the seed data (§0b.2).** The original survey wording invited one-word answers, and four of fifteen came back unmatchable. Use:

- **"I'm good at —"** · placeholder: *"Turning campaign numbers into decisions"*
- **"I'd like to learn —"** · placeholder: *"How to build a sales dashboard that people actually use"* · helper line underneath, in small grey type: **"Name the task, not just the tool. 'Using AI to draft customer replies' finds you a match — 'AI' can't."**

Soft minimum of ~15 characters on both answers, with a friendly inline message rather than a hard block. Optional character cap around 300 with a live counter — the longest seed answer was 396 characters, which is fine prose but heavy in a 180-row roster, and crisper answers match better anyway.

Posts to `/api/submit`, which validates (required fields, honeypot, per-IP rate limit ~5/hour) and **upserts on lowercased email** (§0b.5 — seeded people will scan the QR too, and nobody should appear twice) via the Supabase **service-role** key server-side. Then shows the confirmation state ("You're in. Check your email during the break.").

### 5.2 Live screen (`/screen`)
Subscribes via Supabase Realtime to `participants` inserts (new node appears) and `matches_public` inserts (line is drawn; if `featured`, queue a reveal). This is the real version of what the mockup's "▶ Simulate live demo" button fakes.

**The reveal queue is not optional.** Featured matches will arrive in bursts of 5–15 at once. The screen must hold a queue: play one reveal at a time, ~6s on screen plus ~1.5s gap, always popping the highest-scoring not-yet-shown match. Budget **~24 reveals maximum** across a 3-minute segment; everything else stays as lines on the network, which is what the ambient canvas is for.

**Do not gate reveals on a hard 88.** If the real answers top out at 82, a fixed threshold means an empty screen during the most important two minutes of the talk — a completely avoidable failure. Instead the queue always pops the **highest-scoring match not yet shown, above a floor of ~70**, and the card displays whatever the real number is. Ranking, not a cutoff. Keep the floor in an env var so it can be dropped from `/admin` mid-show, and show the operator the top of the queue so they can see what's coming. Prefer matches involving a `source='live'` row (§0b.5).

**Ambient nodes stay anonymous** — a point of light, at most a country tag. First names appear only in a featured reveal, i.e. only at the moment those two people are actually being talked about on stage. Given there's no opt-in gate, this is the sensible default: nobody's name is projected merely for having filled in a form.

### 5.3 Admin (`/admin`)
Behind basic auth or a long random path.
- **Matching live** toggle — starts/stops the 7-second round clock (§4.3). This is the main control.
- Live counters: responses, matches, featured, rounds run, last round latency.
- **Finalize matches** and **Send result emails** buttons.
- **Force-feature** a specific match on `/screen` right now (for Job to pick one live), and a button to feature the Sasja/Yhore guarantee card.
- **Fallback demo** button that flips `/screen` into the mockup's scripted client-side animation — the safety net if wifi, Supabase or the API has a bad five minutes mid-show. Nearly free to build (same code as the mockup). Wire it in on day one, not Thursday night.

---

## 6. Result email
`/api/send-results` sends one email per person for their `is_final` match, via Resend's **batch** endpoint (not 180 sequential calls). Content: their match's first name + country, what that person is good at / wants to learn, the one-line reason, in the cream/lime house style. Set `email_sent_a` / `email_sent_b` so re-runs never double-send. Send from `bootcamp@joda-ai.nl` (§9.2).

---

## 7. Consent / privacy
One line on the form: *"Your first name, country and answers may be shown on the bootcamp screen during this session."* Not a gate. Email addresses never reach the Realtime feed or the screen — enforced structurally by `matches_public` + RLS (§10), not by convention.

---

## 8. Country field

Construsoft lists **47 countries** it serves from 15 offices across Europe and South America:

Albania, Andorra, Angola, Argentina, Austria, Belgium, Belize, Bolivia, Bulgaria, Cape Verde, Chile, Colombia, Costa Rica, Croatia, Cyprus, Czech Republic, Dominican Republic, Ecuador, El Salvador, Greece, Guatemala, Guinea-Bissau, Guyana, Honduras, Hungary, Liechtenstein, Luxembourg, Mexico, Moldova, Mozambique, Netherlands, Netherlands Antilles, Nicaragua, Panama, Paraguay, Peru, Poland, Portugal, Puerto Rico, Romania, São Tomé and Príncipe, Slovakia, Slovenia, Spain, Suriname, Uruguay, Venezuela.

**Recommendation:** a `<select>` with these 47 alphabetically, plus a final "Other" option that reveals a free-text box. A dropdown keeps the data clean for the screen's country tags (no "NL" vs "Nederland" vs "Netherlands" mess), and 47 options is nothing on a mobile native picker. Pre-select nothing — don't guess.

---

## 9. Setup & credentials

### 9.1 Anthropic — do this first
Key is in hand. **Before anything else, open the Anthropic Console → Settings → Limits and confirm the organisation is on standard rate limits and not the Evaluation tier** (§4.1). Design B needs only ~8 RPM and ~35k ITPM, so even a restricted tier will probably cope — but check, because it's the only rate-limit question that matters and it's a two-minute check. If the org is restricted, request an increase through the console flow; do it Monday, not Thursday.

Model: `claude-sonnet-4-5` for live rounds, per §4.2.

### 9.2 Resend + DNS for joda-ai.nl
See the step-by-step in §11.

### 9.3 Supabase
Project ref `dozdxlswnynodjddkpbe` → project URL `https://dozdxlswnynodjddkpbe.supabase.co`.

**Rotate the database password** — it was shared in chat and the target repo is public. Supabase → Settings → Database → Reset database password.

**Do not connect to Postgres directly on port 5432 from serverless functions.** Serverless invocations each open their own connection and will exhaust the pool under a submission burst. Use `@supabase/supabase-js` over HTTPS instead:
- `SUPABASE_URL` = `https://dozdxlswnynodjddkpbe.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = from Settings → API (server-side only, never in client code)
- `SUPABASE_ANON_KEY` = from Settings → API (safe in the browser; RLS is what protects the data)

If some tooling genuinely needs a direct connection (migrations, psql), use the **Supavisor pooler** connection string on port 6543 in transaction mode, not 5432.

### 9.4 Vercel + repo
Repo: `IT-Student-Lab/bootcamp_matching_tool` (**public** — no secrets in the repo, ever; add `.env*` to `.gitignore` on the first commit). All keys go in Vercel → Project → Settings → Environment Variables:

```
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
RESEND_API_KEY
ADMIN_PASSWORD
```

---

## 10. Data model

```sql
create extension if not exists "pgcrypto";

create table participants (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  first_name     text not null,
  last_name      text,
  country        text not null,
  department     text,
  email          text,                            -- nullable: seed rows may lack it
  good_at        text not null,
  wants_to_learn text not null,
  consent        boolean not null default true,
  source         text not null default 'live',    -- seed | live   (§0b.5)
  person_key     text not null,                   -- normalised name/email; links seed to live
  superseded_by  uuid references participants(id),-- set on a seed row when its person submits live
  status         text not null default 'new'      -- new | matched
);

-- One live row per email (typo re-submits update in place); seed rows are exempt.
create unique index participants_live_email
  on participants (lower(email)) where source = 'live' and email is not null;

create table matches (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  participant_a uuid not null references participants(id),   -- has the skill
  participant_b uuid not null references participants(id),   -- wants the skill
  score         int not null check (score between 0 and 100),
  reason        text not null,
  featured      boolean not null default false,   -- score >= 88
  is_final      boolean not null default false,   -- set by global assignment (4.5)
  shown_at      timestamptz,
  email_sent_a  boolean not null default false,
  email_sent_b  boolean not null default false
);

-- Idempotency: the same unordered pair can never be inserted twice (4.6)
create unique index matches_unique_pair on matches (
  least(participant_a::text, participant_b::text),
  greatest(participant_a::text, participant_b::text)
);

-- Round lock (4.3)
create table runs (
  id         int primary key default 1,
  running    boolean not null default false,
  started_at timestamptz,
  check (id = 1)
);
insert into runs (id, running) values (1, false);

-- Safe-to-broadcast view: no email addresses leave this view.
create view matches_public as
  select m.id, m.created_at, m.score, m.reason, m.featured,
         a.first_name as a_name, a.country as a_country, a.good_at as a_good_at,
         b.first_name as b_name, b.country as b_country, b.wants_to_learn as b_wants
  from matches m
  join participants a on a.id = m.participant_a
  join participants b on b.id = m.participant_b;

alter table participants enable row level security;
alter table matches enable row level security;

create policy "public insert" on participants for insert to anon with check (true);
-- No public SELECT on participants: protects email addresses.

grant select on matches_public to anon;
```

Enable Realtime replication on `participants` and `matches`.

---

## 11. Resend + DNS step-by-step (joda-ai.nl)

**Use the subdomain `send.joda-ai.nl`, not the root domain.** This avoids any conflict with the existing mail on joda-ai.nl (Google Workspace / Microsoft 365 MX records) and keeps sending reputation isolated. The visible From address is still `bootcamp@joda-ai.nl` — the subdomain is only where the authentication records live.

1. **Create the Resend account** at resend.com and verify your login email.
2. **Domains → Add Domain** → enter `send.joda-ai.nl` → **region: `eu-west-1`** (Ireland — keeps attendee data in the EU, which is the right default for a European company emailing European staff).
3. Resend shows a table of DNS records. There will be three kinds:
   - **MX** on `send.joda-ai.nl` → `feedback-smtp.eu-west-1.amazonses.com` (priority 10)
   - **TXT (SPF)** on `send.joda-ai.nl` → `v=spf1 include:amazonses.com ~all`
   - **TXT (DKIM)** on `resend._domainkey.send.joda-ai.nl` → a long public key
   Copy the values from your own dashboard — the DKIM key is unique to you, and the MX host must match the region you picked.
4. **Add them at your DNS provider for joda-ai.nl.** Two traps here, both common:
   - Most Dutch providers (TransIP, Versio, Hostnet, Antagonist) auto-append the domain. So enter the host as **`send`**, not `send.joda-ai.nl` — otherwise you create `send.joda-ai.nl.joda-ai.nl`. Same for DKIM: enter **`resend._domainkey.send`**.
   - If joda-ai.nl sits behind Cloudflare, set these records to **DNS only (grey cloud)**. Proxy mode breaks DKIM verification.
5. **Back in Resend → Verify.** Usually a few minutes; DNS can take up to a few hours. Status flips to *Verified*.
6. **Add a DMARC record** (optional but do it — it materially helps deliverability for a 180-mail burst). TXT on `_dmarc` → `v=DMARC1; p=none; rua=mailto:daan@joda-ai.nl`. Start at `p=none`; this is monitoring only and cannot bounce your mail.
7. **Create an API key** (Resend → API Keys, sending permission only) → put it in Vercel as `RESEND_API_KEY`.
8. **Send yourself a test** from `bootcamp@joda-ai.nl` before Friday, to a Gmail address *and* a Microsoft 365 address, and check it lands in the inbox rather than spam. Do this Monday or Tuesday — if DKIM is wrong you want days, not hours, to fix it.
9. **Check the free-tier limits** against 180 recipients before the day, and use the **batch send** endpoint rather than a loop.

Do steps 1–5 **first**, today or Monday — DNS propagation is the one thing in this build that you cannot compress by working harder.

---

## 12. Build plan

| When | What |
|---|---|
| **Sat/Sun** | Rotate the Supabase password. Resend steps 1–5 (DNS first — it propagates while you sleep). Check the Anthropic tier (§9.1). Verify countries + add emails in the seed CSV (§0b.4). Draft the pre-fill email to attendees. |
| **Mon** | Scaffold the repo, run the SQL in §10, import the seed CSV, wire `/api/submit` + the form. Send the pre-fill invite so answers start landing. |
| **Tue** | `/api/match-round` + the round clock in `/admin`. First real end-to-end: submit → round → match → screen. |
| **Wed** | Style pass to the mockup (canvas, nodes, pulse, featured card, reveal queue). `/api/finalize-matches` incl. global assignment. |
| **Thu** | Email template + `/api/send-results`. **Load test:** script 60 submissions in 90 seconds, check round latency, screen pacing and reveal-queue behaviour under a realistic burst. Full rehearsal, ideally on venue wifi. Freeze code. One-page operator sheet for Job/Daan. |
| **Fri** | Warm-up ping before the segment. Matching-live toggle on when the QR goes up. Finalize + send during the break. |

---

## 13. Still open

- **§0 decision: are we pushing for more answers before Friday?** 15 are in the bank; 60–100 is where this segment stops being fragile. Everything else in this plan is robust; this is the one choice that changes how good it actually looks.
- **Countries and emails for the 15 seed rows** (§0b.4) — the one blocking data task.
- Confirm the Anthropic org is not on the Evaluation tier (§9.1).
- Whether Job wants the Sasja/Yhore card driven from `/admin` as the opening screen state, or kept entirely in the PowerPoint (§5.3).
