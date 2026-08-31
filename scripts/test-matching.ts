import assert from "node:assert/strict";

import { parseRoundMatches, type MatchParticipant } from "../src/lib/matching/round";

const roster: MatchParticipant[] = [
  { id: "00000000-0000-4000-8000-000000000001", created_at: "2026-08-30T00:00:00Z", first_name: "New", country: "NL", good_at: "Automation", wants_to_learn: "Sales", person_key: "new" },
  { id: "00000000-0000-4000-8000-000000000002", created_at: "2026-08-30T00:00:01Z", first_name: "Peer", country: "PL", good_at: "Sales", wants_to_learn: "Automation", person_key: "peer" },
  { id: "00000000-0000-4000-8000-000000000003", created_at: "2026-08-30T00:00:02Z", first_name: "Duplicate", country: "NL", good_at: "Other", wants_to_learn: "Other", person_key: "new" },
  { id: "00000000-0000-4000-8000-000000000004", created_at: "2026-08-30T00:00:03Z", first_name: "Old", country: "ES", good_at: "Data", wants_to_learn: "Writing", person_key: "old" },
];

const raw = `\`\`\`json
{"matches":[
  {"teacher_id":"00000000-0000-4000-8000-000000000001","learner_id":"00000000-0000-4000-8000-000000000002","score":101,"reason":"Strong direction."},
  {"teacher_id":"00000000-0000-4000-8000-000000000002","learner_id":"00000000-0000-4000-8000-000000000001","score":80,"reason":"Lower duplicate."},
  {"teacher_id":"00000000-0000-4000-8000-000000000001","learner_id":"00000000-0000-4000-8000-000000000003","score":90,"reason":"Same person."},
  {"teacher_id":"00000000-0000-4000-8000-000000000002","learner_id":"00000000-0000-4000-8000-000000000004","score":90,"reason":"No new arrival."},
  {"teacher_id":"00000000-0000-4000-8000-000000000001","learner_id":"00000000-0000-4000-8000-000000000004","score":59,"reason":"Too weak."},
  {"teacher_id":"not-a-valid-id","learner_id":"00000000-0000-4000-8000-000000000001","score":90,"reason":"Hallucinated."}
]}
\`\`\``;

assert.deepEqual(parseRoundMatches(raw, roster, new Set([roster[0].id])), [{
  teacher_id: roster[0].id,
  learner_id: roster[1].id,
  score: 100,
  reason: "Strong direction.",
}]);

const truncated = `{"matches":[
  {"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":88,"reason":"Complete entry."},
  {"teacher_id":"${roster[0].id}","learner_id":"${roster[3].id}","score":80,"reason":"Cut off halfw`;

assert.deepEqual(parseRoundMatches(truncated, roster, new Set([roster[0].id])), [{
  teacher_id: roster[0].id,
  learner_id: roster[1].id,
  score: 88,
  reason: "Complete entry.",
}], "a truncated response must still yield its complete matches");

const trailingProse = `{"matches":[{"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":"84","reason":"Quoted score."}]}
I left out the others because no concrete teaching connection exists.`;

assert.deepEqual(parseRoundMatches(trailingProse, roster, new Set([roster[0].id])), [{
  teacher_id: roster[0].id,
  learner_id: roster[1].id,
  score: 84,
  reason: "Quoted score.",
}], "trailing prose and a quoted score must not discard the round");

const overlongReason = `{"matches":[{"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":90,"reason":"${"x".repeat(400)}"}]}`;
assert.equal(parseRoundMatches(overlongReason, roster, new Set([roster[0].id]))[0].reason.length, 300, "an overlong reason is clamped, not dropped");

assert.deepEqual(parseRoundMatches("The room is too small to match anyone yet.", roster, new Set([roster[0].id])), [], "unparsable output returns no matches instead of throwing");

console.log("Matching parser guardrails passed.");