import { z } from "zod";

import { buildRosterPrompt, type MatchParticipant } from "./round";

export type NearMiss = { id: string; reason: string };
export type NearMissSuggestion = { participant_id: string; people: NearMiss[] };

const MAX_PEOPLE_PER_PARTICIPANT = 3;

const personSchema = z.object({ id: z.string(), reason: z.string().trim().min(1) });
const suggestionSchema = z.object({ participant_id: z.string(), people: z.array(personSchema).max(20) });
const responseSchema = z.object({ suggestions: z.array(z.unknown()).max(200) });

function formatUnmatched(participant: MatchParticipant) {
  return JSON.stringify({
    id: participant.id,
    name: participant.first_name,
    country: participant.country,
    good_at: participant.good_at,
    wants_to_learn: participant.wants_to_learn,
  });
}

export function buildNearMissPrompt(unmatched: MatchParticipant[]) {
  return `THESE PEOPLE HAVE NO MATCH
${unmatched.map(formatUnmatched).join("\n")}

None of these people could be given a real match: either their two answers were too short and vague to work with, or nobody in the room could concretely help them. They are still getting an email, and it must be useful rather than empty.

For each of them, name up to three people from the room whose topic is closest to theirs. This is deliberately a weaker bar than a match: these are people worth walking up to during a break, not a promise that one can teach the other.

Prefer people whose strength touches what this person wants to learn. When the person's own answers are only a few words, use whatever topic those words point at.
Never suggest the person themselves. Never suggest the same person twice for one participant. Suggest fewer than three, or none at all, rather than reaching for someone unrelated.
Order the people best first. The reason must be one specific sentence in plain English of at most 15 words, addressed about the pair, not to the reader.
Return only JSON with this shape and no other text, and no commentary after it:
{"suggestions":[{"participant_id":"...","people":[{"id":"...","reason":"..."}]}]}`;
}

export function buildNearMissMessages(unmatched: MatchParticipant[], roster: MatchParticipant[]) {
  return [
    { type: "text" as const, text: buildRosterPrompt(roster), cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: buildNearMissPrompt(unmatched) },
  ];
}

export function parseNearMisses(raw: string, roster: MatchParticipant[], unmatched: MatchParticipant[]) {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let candidates: unknown[];
  try {
    candidates = responseSchema.parse(JSON.parse(text)).suggestions;
  } catch {
    return [];
  }

  // Subjects are validated separately: someone with answers too thin to be suggestable is still a subject.
  const subjects = new Map(unmatched.map((participant) => [participant.id, participant]));
  const suggestable = new Map(roster.map((participant) => [participant.id, participant]));
  const results = new Map<string, NearMissSuggestion>();

  for (const rawCandidate of candidates) {
    const parsed = suggestionSchema.safeParse(rawCandidate);
    if (!parsed.success) continue;
    const subject = subjects.get(parsed.data.participant_id);
    if (!subject || results.has(subject.id)) continue;

    const people: NearMiss[] = [];
    const seen = new Set<string>();
    for (const person of parsed.data.people) {
      const candidate = suggestable.get(person.id);
      if (!candidate || candidate.id === subject.id || candidate.person_key === subject.person_key) continue;
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      people.push({ id: candidate.id, reason: person.reason.slice(0, 300) });
      if (people.length === MAX_PEOPLE_PER_PARTICIPANT) break;
    }
    if (people.length > 0) results.set(subject.id, { participant_id: subject.id, people });
  }

  return [...results.values()];
}
