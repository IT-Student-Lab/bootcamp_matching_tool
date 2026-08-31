# Operator sheet — Construsoft Bootcamp live matchmaker

One page. Keep it open on the operator laptop. Friday 4 September 2026, Kraków.

| Who | Screen | URL |
| --- | --- | --- |
| Audience | Mobile form | the QR target |
| Projector | Live room | `/screen` |
| Operator | Match control | `/admin` |

The projector laptop shows **only** `/screen`. Never open `/admin` on the beamer.

---

## Before the talk

1. Open `/admin`, type the admin password once. Every button stays disabled until you do.
2. Press **Delete live submissions**, then **Delete all matches**. This clears rehearsal and load-test data. The 15 seed answers stay.
3. Open `/screen` on the projector laptop, press **F** for fullscreen. The cursor hides itself after three seconds.
4. Two minutes before the segment, press **Warm up**. It should report `Warm (…ms)`. This costs nothing and avoids a cold start on the first real round.
5. Leave **Matching rounds** off until the QR code is on screen.

---

## During the segment

1. QR goes up → switch **Matching rounds** on. Rounds now fire every 7 seconds.
2. Watch the **Status** and **Last latency** lines. A round takes roughly 10–25 seconds, so most 7-second ticks report `Previous round still running`. That is normal and correct — it is the lock doing its job.
3. `… queued` in the status means submissions are waiting for the next round. Also normal during a burst; nobody is lost.
4. On `/screen`, the five highest-scoring matches carry a small clickable label. **Click a label to reveal that match full screen.** Use **← Previous / Next →** to walk through the ranking, **Close** or a click on the background to go back to the network.
5. To push a specific pair yourself, use the **▶** button next to any entry in *Top of reveal queue* on `/admin`, or **Feature Sasja / Yhore now** when it appears.
6. When the window closes → switch **Matching rounds** off.

---

## During the break

1. **Finalize matches.** Takes up to a few minutes; it fills gaps for early arrivals and gives everyone exactly one match. Safe to run twice — the result is identical.
2. Check the reported line: `Finalized: N matched, M unresolved`. A small number of unresolved people is honest, not a bug.
3. **Send result emails.** Already-sent people are skipped, so a second press never double-sends. Mail goes out from `bootcamp@joda-ai.nl`.

Before the day itself, use **Test mail → Send one test** to check a Gmail address and a Microsoft 365 address. It sends exactly one message through the real template and touches nothing in the database.

---

## If something goes wrong

| Symptom | Do this |
| --- | --- |
| Screen frozen or blank | Reload `/screen`. It rebuilds from the database in about a second. Nothing is lost. |
| Small dot bottom-right turned red | Realtime lost connection. The screen keeps showing what it has and reconnects itself. Do nothing. |
| No network at the venue | Open `/screen?fallback=1`. Fully local scripted demo, no server needed. Works with the network cable pulled. |
| You want a rehearsed run instead of the audience | **▶ Start seed demo** — seed answers arrive one by one, then a matching round fires automatically after 9 seconds. |
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

## Do not

- Do not open `/admin` on the projector.
- Do not press **Delete live submissions** after the segment. It permanently removes the audience's answers.
- Do not run the load test against production on the day itself.
