import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getAdminEnv, getAnthropicEnv } from "@/lib/env";
import { requestRoundMatches } from "@/lib/matching/anthropic";
import { parseRoundMatches, type MatchParticipant } from "@/lib/matching/round";
import { createServiceClient } from "@/lib/supabase/server";

const MINIMUM_ROSTER_SIZE = 15;
const THIN_POOL_WAIT_SECONDS = 30;
// Bounds round latency during a submission burst; the overflow is picked up by the next round.
// Smaller rounds give the same throughput but land matches on screen more often.
const MAX_ARRIVALS_PER_ROUND = 10;

function passwordsMatch(provided: string | null, expected: string) {
  if (!provided) return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function participantHasUsefulAnswers(participant: MatchParticipant) {
  return participant.good_at.trim().length >= 4 && participant.wants_to_learn.trim().length >= 4;
}

// Warms the function, its imports and the Supabase connection without running a round.
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  if (!passwordsMatch(request.headers.get("x-admin-password"), getAdminEnv().ADMIN_PASSWORD)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { error } = await createServiceClient().from("runs").select("running").eq("id", 1).single();
    if (error) throw error;
    return NextResponse.json({ ok: true, warm: true, latencyMs: Date.now() - startedAt });
  } catch (error) {
    console.error("match_round_warmup_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "warmup_failed", latencyMs: Date.now() - startedAt });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let lockAcquired = false;
  let outcome = "error";
  let errorCode: string | null = null;
  let supabase: ReturnType<typeof createServiceClient> | null = null;

  try {
    const adminEnv = getAdminEnv();
    if (!passwordsMatch(request.headers.get("x-admin-password"), adminEnv.ADMIN_PASSWORD)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    supabase = createServiceClient();
    const lock = await supabase.rpc("try_acquire_round", { stale_after_seconds: 60 });
    if (lock.error) throw lock.error;
    if (!lock.data) return NextResponse.json({ ok: true, skipped: true, reason: "round_in_flight" });
    lockAcquired = true;

    const fields = "id,created_at,first_name,country,good_at,wants_to_learn,person_key";
    const arrivalsResult = await supabase.from("participants").select(fields).eq("status", "new").is("superseded_by", null).order("created_at");
    if (arrivalsResult.error) throw arrivalsResult.error;
    const pendingArrivals = arrivalsResult.data as MatchParticipant[];
    if (pendingArrivals.length === 0) {
      outcome = "no_new_arrivals";
      return NextResponse.json({ ok: true, skipped: true, reason: outcome });
    }
    const newArrivals = pendingArrivals.slice(0, MAX_ARRIVALS_PER_ROUND);

    const rosterResult = await supabase.from("participants").select(fields).is("superseded_by", null).order("created_at");
    if (rosterResult.error) throw rosterResult.error;
    const roster = rosterResult.data as MatchParticipant[];
    const firstArrivalAgeSeconds = (Date.now() - new Date(newArrivals[0].created_at).getTime()) / 1000;
    if (roster.length < MINIMUM_ROSTER_SIZE && firstArrivalAgeSeconds < THIN_POOL_WAIT_SECONDS) {
      outcome = "waiting_for_pool";
      return NextResponse.json({ ok: true, waiting: true, rosterSize: roster.length });
    }

    const usefulRoster = roster.filter(participantHasUsefulAnswers);
    const usefulArrivalIds = new Set(newArrivals.filter(participantHasUsefulAnswers).map((participant) => participant.id));
    let matches: ReturnType<typeof parseRoundMatches> = [];
    let inputTokens = 0;
    let outputTokens = 0;

    if (usefulArrivalIds.size > 0 && usefulRoster.length > 1) {
      const anthropicEnv = getAnthropicEnv();
      const result = await requestRoundMatches(
        anthropicEnv.ANTHROPIC_API_KEY,
        newArrivals.filter((participant) => usefulArrivalIds.has(participant.id)),
        usefulRoster,
        anthropicEnv.ANTHROPIC_WORKSPACE_ID,
      );
      matches = result.matches;
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
    }

    let insertedMatches = 0;
    for (const match of matches) {
      const insert = await supabase.from("matches").insert({
        participant_a: match.teacher_id,
        participant_b: match.learner_id,
        score: match.score,
        reason: match.reason,
      });
      if (insert.error?.code === "23505") continue;
      if (insert.error) throw insert.error;
      insertedMatches += 1;
    }

    const statusUpdate = await supabase.from("participants").update({ status: "matched", updated_at: new Date().toISOString() }).in("id", newArrivals.map((participant) => participant.id));
    if (statusUpdate.error) throw statusUpdate.error;
    outcome = "completed";
    return NextResponse.json({
      ok: true,
      arrivals: newArrivals.length,
      queuedArrivals: pendingArrivals.length - newArrivals.length,
      rosterSize: roster.length,
      candidateMatches: matches.length,
      insertedMatches,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    errorCode = error instanceof Error ? error.name : "unknown_error";
    console.error("match_round_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "round_failed", latencyMs: Date.now() - startedAt });
  } finally {
    if (lockAcquired && supabase) {
      const release = await supabase.rpc("release_round", {
        outcome,
        latency_ms: Date.now() - startedAt,
        error_code: errorCode,
      });
      if (release.error) console.error("match_round_release_failed", release.error.code);
    }
  }
}