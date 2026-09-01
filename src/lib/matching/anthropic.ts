import Anthropic from "@anthropic-ai/sdk";

import { buildNearMissMessages, parseNearMisses } from "./near-misses";
import { buildArrivalsPrompt, buildRosterPrompt, parseRoundMatches, type MatchParticipant } from "./round";

export const MATCHING_MODEL = "claude-sonnet-4-5";

export async function requestRoundMatches(apiKey: string, newArrivals: MatchParticipant[], roster: MatchParticipant[], workspaceId?: string) {
  const anthropic = new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
  const newArrivalIds = new Set(newArrivals.map((participant) => participant.id));
  const message = await anthropic.messages.create({
    model: MATCHING_MODEL,
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: buildRosterPrompt(roster), cache_control: { type: "ephemeral" } },
        { type: "text", text: buildArrivalsPrompt(newArrivals) },
      ],
    }],
  });
  const responseText = message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  return {
    matches: parseRoundMatches(responseText, roster, newArrivalIds),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

export async function requestNearMisses(apiKey: string, unmatched: MatchParticipant[], roster: MatchParticipant[], workspaceId?: string) {
  const anthropic = new Anthropic({
    apiKey,
    defaultHeaders: workspaceId ? { "anthropic-workspace-id": workspaceId } : undefined,
  });
  const message = await anthropic.messages.create({
    model: MATCHING_MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: buildNearMissMessages(unmatched, roster) }],
  });
  const responseText = message.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  return { suggestions: parseNearMisses(responseText, roster, unmatched) };
}