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
  {"teacher_id":"00000000-0000-4000-8000-000000000001","learner_id":"00000000-0000-4000-8000-000000000002","score":101,"teacher_evidence":"Automation","learner_evidence":"Automation","reason":"Strong direction."},
  {"teacher_id":"00000000-0000-4000-8000-000000000002","learner_id":"00000000-0000-4000-8000-000000000001","score":80,"teacher_evidence":"Sales","learner_evidence":"Sales","reason":"Lower duplicate."},
  {"teacher_id":"00000000-0000-4000-8000-000000000001","learner_id":"00000000-0000-4000-8000-000000000003","score":90,"teacher_evidence":"Automation","learner_evidence":"Other","reason":"Same person."},
  {"teacher_id":"00000000-0000-4000-8000-000000000002","learner_id":"00000000-0000-4000-8000-000000000004","score":90,"teacher_evidence":"Sales","learner_evidence":"Writing","reason":"No new arrival."},
  {"teacher_id":"00000000-0000-4000-8000-000000000001","learner_id":"00000000-0000-4000-8000-000000000004","score":59,"teacher_evidence":"Automation","learner_evidence":"Writing","reason":"Too weak."},
  {"teacher_id":"not-a-valid-id","learner_id":"00000000-0000-4000-8000-000000000001","score":90,"teacher_evidence":"x","learner_evidence":"x","reason":"Hallucinated."}
]}
\`\`\``;

assert.deepEqual(parseRoundMatches(raw, roster, new Set([roster[0].id])), [{
  teacher_id: roster[0].id,
  learner_id: roster[1].id,
  score: 100,
  reason: "Strong direction.",
}]);

const truncated = `{"matches":[
  {"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":88,"teacher_evidence":"Automation","learner_evidence":"Automation","reason":"Complete entry."},
  {"teacher_id":"${roster[0].id}","learner_id":"${roster[3].id}","score":80,"teacher_evidence":"Automation","learner_evidence":"Writing","reason":"Cut off halfw`;

assert.deepEqual(parseRoundMatches(truncated, roster, new Set([roster[0].id])), [{
  teacher_id: roster[0].id,
  learner_id: roster[1].id,
  score: 88,
  reason: "Complete entry.",
}], "a truncated response must still yield its complete matches");

const trailingProse = `{"matches":[{"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":"84","teacher_evidence":"Automation","learner_evidence":"Automation","reason":"Quoted score."}]}
I left out the others because no concrete teaching connection exists.`;

assert.deepEqual(parseRoundMatches(trailingProse, roster, new Set([roster[0].id])), [{
  teacher_id: roster[0].id,
  learner_id: roster[1].id,
  score: 84,
  reason: "Quoted score.",
}], "trailing prose and a quoted score must not discard the round");

const overlongReason = `{"matches":[{"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":90,"teacher_evidence":"Automation","learner_evidence":"Automation","reason":"${"x".repeat(400)}"}]}`;
assert.equal(parseRoundMatches(overlongReason, roster, new Set([roster[0].id]))[0].reason.length, 300, "an overlong reason is clamped, not dropped");

assert.deepEqual(parseRoundMatches("The room is too small to match anyone yet.", roster, new Set([roster[0].id])), [], "unparsable output returns no matches instead of throwing");

// Regression: a real production case had a correct-looking teacher/learner id pair whose
// "reason" actually described two unrelated people. The evidence quotes must be real substrings.
const ungroundedEvidence = `{"matches":[{"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":72,"teacher_evidence":"leading and motivating teams","learner_evidence":"presenting to bigger audiences","reason":"Unrelated to either person's actual fields."}]}`;
assert.deepEqual(parseRoundMatches(ungroundedEvidence, roster, new Set([roster[0].id])), [], "a reason not grounded in the pair's own fields must be dropped");

const missingEvidence = `{"matches":[{"teacher_id":"${roster[0].id}","learner_id":"${roster[1].id}","score":90,"reason":"No evidence fields at all."}]}`;
assert.deepEqual(parseRoundMatches(missingEvidence, roster, new Set([roster[0].id])), [], "missing evidence fields fail schema validation");

console.log("Matching parser guardrails passed.");