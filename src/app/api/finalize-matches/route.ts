import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getAdminEnv, getAnthropicEnv } from "@/lib/env";
import { buildFinalAssignments, type CandidatePair } from "@/lib/matching/assignment";
import { requestNearMisses, requestRoundMatches } from "@/lib/matching/anthropic";
import type { NearMiss } from "@/lib/matching/near-misses";
import type { MatchParticipant } from "@/lib/matching/round";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;
const CHUNK_SIZE = 20;

function authorized(provided: string | null) {
  const expected = getAdminEnv().ADMIN_PASSWORD;
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function useful(participant: MatchParticipant) {
  return participant.good_at.trim().length >= 4 && participant.wants_to_learn.trim().length >= 4;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const supabase = createServiceClient();
  let lockAcquired = false;
  let outcome = "finalize_error";
  let errorCode: string | null = null;
  try {
    if (!authorized(request.headers.get("x-admin-password"))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const lock = await supabase.rpc("try_acquire_round", { stale_after_seconds: 600 });
    if (lock.error) throw lock.error;
    if (!lock.data) return NextResponse.json({ ok: true, skipped: true, reason: "round_in_flight" });
    lockAcquired = true;

    const participantResult = await supabase.from("participants")
      .select("id,created_at,first_name,country,email,good_at,wants_to_learn,person_key")
      .is("superseded_by", null).order("created_at");
    if (participantResult.error) throw participantResult.error;
    const participants = participantResult.data as (MatchParticipant & { email: string | null })[];
    const usefulRoster = participants.filter(useful);

    const initialMatches = await supabase.from("matches").select("id,participant_a,participant_b,score").gte("score", 60);
    if (initialMatches.error) throw initialMatches.error;
    const coveredIds = new Set(initialMatches.data.flatMap((match) => [match.participant_a, match.participant_b]));
    const gaps = usefulRoster.filter((participant) => !coveredIds.has(participant.id));
    const anthropicEnv = getAnthropicEnv();
    let generatedCandidates = 0;
    let skippedChunks = 0;

    for (let offset = 0; offset < gaps.length; offset += CHUNK_SIZE) {
      const chunk = gaps.slice(offset, offset + CHUNK_SIZE);
      try {
        const generated = await requestRoundMatches(anthropicEnv.ANTHROPIC_API_KEY, chunk, usefulRoster, anthropicEnv.ANTHROPIC_WORKSPACE_ID);
        for (const match of generated.matches) {
          const insert = await supabase.from("matches").insert({ participant_a: match.teacher_id, participant_b: match.learner_id, score: match.score, reason: match.reason });
          if (insert.error?.code === "23505") continue;
          if (insert.error) throw insert.error;
          generatedCandidates += 1;
        }
      } catch (error) {
        skippedChunks += 1;
        console.error("finalize_chunk_skipped", error instanceof Error ? error.message : "unknown");
      }
    }

    const candidateResult = await supabase.from("matches").select("id,participant_a,participant_b,score").gte("score", 60);
    if (candidateResult.error) throw candidateResult.error;
    const assignments = buildFinalAssignments(participants.map((participant) => participant.id), candidateResult.data as CandidatePair[]);
    const participantById = new Map(participants.map((participant) => [participant.id, participant]));

    // Everyone with an address gets an email, so the unresolved need somebody to walk up to as well.
    const unmatchedRecipients = assignments
      .filter((assignment) => assignment.status === "unresolved")
      .map((assignment) => participantById.get(assignment.participantId))
      .filter((participant): participant is (MatchParticipant & { email: string | null }) => Boolean(participant?.email));
    const nearMissesById = new Map<string, NearMiss[]>();
    let skippedNearMissChunks = 0;

    for (let offset = 0; offset < unmatchedRecipients.length; offset += CHUNK_SIZE) {
      const chunk = unmatchedRecipients.slice(offset, offset + CHUNK_SIZE);
      try {
        const suggested = await requestNearMisses(anthropicEnv.ANTHROPIC_API_KEY, chunk, usefulRoster, anthropicEnv.ANTHROPIC_WORKSPACE_ID);
        for (const suggestion of suggested.suggestions) nearMissesById.set(suggestion.participant_id, suggestion.people);
      } catch (error) {
        skippedNearMissChunks += 1;
        console.error("finalize_near_miss_chunk_skipped", error instanceof Error ? error.message : "unknown");
      }
    }

    const clearAssignments = await supabase.from("final_assignments").delete().not("participant_id", "is", null);
    if (clearAssignments.error) throw clearAssignments.error;
    if (assignments.length > 0) {
      const insertAssignments = await supabase.from("final_assignments").insert(assignments.map((assignment) => {
        const participant = participantById.get(assignment.participantId);
        const unresolved = assignment.status === "unresolved";
        return {
          participant_id: assignment.participantId,
          match_id: assignment.matchId,
          status: assignment.status,
          unresolved_reason: !unresolved ? null : participant && useful(participant) ? "no_strong_match" : "thin_answers",
          near_misses: unresolved ? nearMissesById.get(assignment.participantId) ?? [] : [],
          email_status: participant?.email ? "pending" : "not_applicable",
          updated_at: new Date().toISOString(),
        };
      }));
      if (insertAssignments.error) throw insertAssignments.error;
    }

    outcome = "finalized";
    return NextResponse.json({
      ok: true,
      participants: participants.length,
      gapsConsidered: gaps.length,
      generatedCandidates,
      skippedChunks,
      matched: assignments.filter((assignment) => assignment.status === "matched").length,
      unresolved: assignments.filter((assignment) => assignment.status === "unresolved").length,
      nearMissesFound: nearMissesById.size,
      skippedNearMissChunks,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    errorCode = error instanceof Error ? error.name : "unknown_error";
    console.error("finalize_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "finalize_failed", latencyMs: Date.now() - startedAt });
  } finally {
    if (lockAcquired) {
      const release = await supabase.rpc("release_round", { outcome, latency_ms: Date.now() - startedAt, error_code: errorCode });
      if (release.error) console.error("finalize_release_failed", release.error.code);
    }
  }
}