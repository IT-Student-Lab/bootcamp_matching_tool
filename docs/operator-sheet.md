# Operator sheet — Construsoft Bootcamp live matchmaker

One page. Keep it open on the operator laptop. Friday 4 September 2026, Kraków.

**Daan operates `/admin` from a laptop within reach of the stage. Job talks, Daan clicks.** Nothing reveals itself.
The spoken side of this is `docs/script-part2-revised.md`; the two are meant to be read together.

| Who | Screen | URL |
| --- | --- | --- |
| Audience | Mobile form | `https://bootcamp-matching-tool.vercel.app/` — the QR target |
| Projector | Live room | `https://bootcamp-matching-tool.vercel.app/screen` |
| Operator | Match control | `https://bootcamp-matching-tool.vercel.app/admin` |

The projector laptop shows **only** `/screen`. Never open `/admin` on the beamer.

---

## Before the talk

1. Open `/admin`, type the admin password once. The browser remembers it on this device, so you only do this on a laptop you trust. Every button stays disabled until it is filled in.
2. Press **Delete live submissions**, then **Delete all matches**. This clears rehearsal and load-test data. The 15 seed answers stay.
3. Open `/screen` on the projector laptop, press **F** for fullscreen. The cursor hides itself after three seconds.
4. Two minutes before the segment, press **Warm up**. It should report `Warm (…ms)`. This costs nothing and avoids a cold start on the first real round.
5. Leave **Matching rounds** off until the QR code is on screen.

---

## During the segment

1. QR goes up → switch **Matching rounds** on. Rounds now fire every 7 seconds.
2. Watch the **Status** and **Last latency** lines. A round takes roughly 10–25 seconds, so most 7-second ticks report `Previous round still running`. That is normal and correct — it is the lock doing its job.
3. `… queued` in the status means submissions are waiting for the next round. Also normal during a burst; nobody is lost. Ten arrivals go into each round, so with a full room the lines keep appearing for several minutes after the last phone submits.
4. At Job's cue in the proof block, press **Feature Sasja / Yhore now**.
5. For the live reveals: click a match label on `/screen`, or press **▶** next to an entry in *Top of reveal queue* on `/admin`. Walk the ranking with **← Previous / Next →**; **Close** or a click on the background returns to the network.
6. Job reads each card aloud in a fixed order — score, then names, then the reason line. Give him a beat after each click.
7. When the window closes → switch **Matching rounds** off, before Daan walks forward for the landing.

---

## During the break

1. **Finalize matches.** Takes up to a few minutes; it fills gaps for early arrivals, gives everyone exactly one match where one honestly exists, and looks up three nearby people for everyone left over. Safe to run twice — the result is identical.
2. Check the reported line: `Finalized: N matched, M unresolved (K with suggestions)`. A number of unresolved people is expected, not a bug — usually answers that were too short to match on.
3. **Send result emails.** Matched people get their match; unresolved people get an honest no-match mail explaining why, with up to three people closest to their topic. Already-sent people are skipped, so a second press never double-sends. Mail goes out from `bootcamp@resend.joda-ai.nl`.

Before the day itself, use **Test mail** to check a Gmail address and a Microsoft 365 address. **Send one test** exercises the match template, **No-match test** exercises the no-match template. Both send exactly one message and touch nothing in the database.

---

## If something goes wrong

| Symptom | Do this |
| --- | --- |
| Screen frozen or blank | Reload `/screen`. It rebuilds from the database in about a second. Nothing is lost. |
| Small dot bottom-right turned red | Realtime lost connection. The screen keeps showing what it has and reconnects itself. Do nothing. |
| No network at the venue | Open `/screen?fallback=1`. Fully local scripted demo, no server needed. Works with the network cable pulled. |
| You want a rehearsed run instead of the audience | **▶ Start seed demo** — seed answers arrive one by one, then a matching round fires automatically after 9 seconds. **Before the segment only; it deletes every match.** |
| Status says `Round failed safely` | Ignore it. The next round retries. A single failed round is invisible on screen. |
| Status says `Incorrect password` | The toggle switched itself off. Retype the password and switch it back on. |
| Nothing is ever revealed | Lower **Reveal floor** on `/admin` (default 70) and press **Apply**. |
| Matching is producing nonsense | Switch **Matching rounds** off and press the Fallback button under *Projector*. |

---

## Measured on the rehearsal build

- 60 submissions in 90 seconds: all accepted, p50 260 ms, p95 439 ms, no rate limiting.
- Round latency with 10 arrivals against a 75-person room: 12–24 s, mean ~18 s.
- Rounds never overlap; the second caller gets `round_in_flight` and returns immediately.
- Seed answers still produce Sasja → Yhore at 92% as the top match.

## Measured on production (Vercel, Frankfurt)

- Warm-up round trip: 350 ms.
- Matching round: 6.9 s server-side.
- Form submission: p50 705 ms, p95 1.7 s.

## Do not

- Do not open `/admin` on the projector.
- Do not press **▶ Start seed demo** during the segment. It wipes every match and resets everyone to `new`. It is a rehearsal button.
- Do not press **Delete live submissions** after the segment. It permanently removes the audience's answers.
- Do not run the load test against production on the day itself.
