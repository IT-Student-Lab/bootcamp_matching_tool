import "dotenv/config";

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { MATCHING_MODEL, requestRoundMatches } from "../src/lib/matching/anthropic";
import type { MatchParticipant } from "../src/lib/matching/round";

const env = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_WORKSPACE_ID: z.string().trim().min(1).optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
}).parse({ ...process.env, ANTHROPIC_WORKSPACE_ID: process.env.ANTHROPIC_WORKSPACE_ID || undefined });

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await supabase
    .from("participants")
    .select("id,created_at,first_name,country,good_at,wants_to_learn,person_key")
    .eq("source", "seed")
    .is("superseded_by", null)
    .order("created_at");
  if (result.error) throw result.error;
  const seeds = result.data as MatchParticipant[];
  if (seeds.length !== 15) throw new Error(`Expected 15 active seeds, found ${seeds.length}. Evaluation aborted.`);

  const evaluation = await requestRoundMatches(env.ANTHROPIC_API_KEY, seeds, seeds, env.ANTHROPIC_WORKSPACE_ID);
  const names = new Map(seeds.map((participant) => [participant.id, participant.first_name]));
  const matches = [...evaluation.matches].sort((left, right) => right.score - left.score);

  console.log(`Model: ${MATCHING_MODEL}`);
  console.log(`Tokens: ${evaluation.inputTokens} input / ${evaluation.outputTokens} output`);
  console.log(`Matches: ${matches.length}`);
  for (const match of matches) {
    console.log(`${match.score} | ${names.get(match.teacher_id)} -> ${names.get(match.learner_id)} | ${match.reason}`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof Anthropic.APIError) console.error(`Anthropic ${error.status}: ${error.message}`);
  else console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});