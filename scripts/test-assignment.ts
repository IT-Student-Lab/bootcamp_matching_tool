import assert from "node:assert/strict";

import { buildFinalAssignments } from "../src/lib/matching/assignment";

const result = buildFinalAssignments(["a", "b", "c", "d", "e"], [
  { id: "ab", participant_a: "a", participant_b: "b", score: 95 },
  { id: "ac", participant_a: "a", participant_b: "c", score: 90 },
  { id: "cd", participant_a: "c", participant_b: "d", score: 85 },
  { id: "outside", participant_a: "d", participant_b: "x", score: 100 },
]);

assert.deepEqual(result, [
  { participantId: "a", matchId: "ab", status: "matched" },
  { participantId: "b", matchId: "ab", status: "matched" },
  { participantId: "c", matchId: "cd", status: "matched" },
  { participantId: "d", matchId: "cd", status: "matched" },
  { participantId: "e", matchId: null, status: "unresolved" },
]);

const secondChance = buildFinalAssignments(["a", "b", "c"], [
  { id: "ab", participant_a: "a", participant_b: "b", score: 95 },
  { id: "ac", participant_a: "a", participant_b: "c", score: 90 },
]);
assert.equal(secondChance.find((assignment) => assignment.participantId === "c")?.matchId, "ac");

console.log("Global assignment tests passed.");