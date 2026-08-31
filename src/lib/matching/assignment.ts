export type CandidatePair = { id: string; participant_a: string; participant_b: string; score: number };
export type FinalAssignment = { participantId: string; matchId: string | null; status: "matched" | "unresolved" };

export function buildFinalAssignments(participantIds: string[], candidatePairs: CandidatePair[]) {
  const activeIds = new Set(participantIds);
  const pairs = candidatePairs
    .filter((pair) => activeIds.has(pair.participant_a) && activeIds.has(pair.participant_b) && pair.participant_a !== pair.participant_b)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const assignments = new Map<string, FinalAssignment>();

  for (const pair of pairs) {
    if (assignments.has(pair.participant_a) || assignments.has(pair.participant_b)) continue;
    assignments.set(pair.participant_a, { participantId: pair.participant_a, matchId: pair.id, status: "matched" });
    assignments.set(pair.participant_b, { participantId: pair.participant_b, matchId: pair.id, status: "matched" });
  }

  for (const participantId of participantIds) {
    if (assignments.has(participantId)) continue;
    const secondChance = pairs.find((pair) => pair.participant_a === participantId || pair.participant_b === participantId);
    assignments.set(participantId, secondChance
      ? { participantId, matchId: secondChance.id, status: "matched" }
      : { participantId, matchId: null, status: "unresolved" });
  }

  return participantIds.map((participantId) => assignments.get(participantId)!);
}