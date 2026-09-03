// The five matches Job narrates on stage. Inserted every round so they exist even if the model
// misses them, and listed in narration order on /admin so Daan can feature them by hand.
// person_key is the seed key; a live submission inherits it, so the lookup survives a supersede.
export type CuratedMatch = {
  teacherKey: string;
  learnerKey: string;
  teacherName: string;
  learnerName: string;
  score: number;
  reason: string;
};
export const CURATED_MATCHES: CuratedMatch[] = [
  {
    teacherKey: "sasja-knaven",
    learnerKey: "yhore-gonzalez",
    teacherName: "Sasja",
    learnerName: "Yhore",
    score: 92,
    reason: "Sasja's skill in analysis and statistics is exactly what Yhore needs to turn sales data into real trends.",
  },
  {
    teacherKey: "igor-guerra",
    learnerKey: "dominik-marsy",
    teacherName: "Igor",
    learnerName: "Dominik",
    score: 93,
    reason: "Igor spots what is missing from user manuals and training material, which is exactly what Dominik needs before an AI agent can write real e-learning content.",
  },
  {
    teacherKey: "yhore-gonzalez",
    learnerKey: "camila-ocampo",
    teacherName: "Yhore",
    learnerName: "Camila",
    score: 87,
    reason: "Yhore's grip on opportunity follow-up, quotes and a clean CRM is exactly what Camila needs to turn better workflows into qualified leads.",
  },
  {
    teacherKey: "manuel-amicone-ar",
    learnerKey: "alejandro-cases",
    teacherName: "Manuel",
    learnerName: "Alejandro",
    score: 95,
    reason: "Manuel builds Grasshopper tools that optimise customer workflows, which is exactly the computational modelling Alejandro wants to learn to automate repetitive work.",
  },
  {
    teacherKey: "ruben-bex",
    learnerKey: "jiri-martinek",
    teacherName: "Ruben",
    learnerName: "Jiří",
    score: 83,
    reason: "Ruben uses humour and social ease to carry a presentation, which is exactly what Jiří needs to face the public speaking he avoids as an introvert.",
  },
];

// MT members who asked not to be highlighted. Their answers still count, still show as a node and
// still get a line and an email; they are only kept out of the labels and the reveal card.
// Only first names reach the projector, so this over-blocks anyone who shares one - deliberately.
const NO_HIGHLIGHT_FIRST_NAMES = new Set([
  "agnieszka", "carl", "niklas", "caspar", "steven", "florie", "martin",
  "marcel", "istvan", "kristiaan", "femke", "natalia", "vakis",
]);

export function mayBeHighlighted(firstNameA: string, firstNameB: string) {
  const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("en");
  return !NO_HIGHLIGHT_FIRST_NAMES.has(normalize(firstNameA)) && !NO_HIGHLIGHT_FIRST_NAMES.has(normalize(firstNameB));
}

// -1 when the pair is not one of the scripted five; otherwise its position in the narration order.
export function curatedOrder(firstNameA: string, firstNameB: string) {
  return CURATED_MATCHES.findIndex((curated) => curated.teacherName === firstNameA && curated.learnerName === firstNameB);
}
