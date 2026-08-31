import "dotenv/config";
import { COUNTRIES } from "../src/lib/countries";

const DEFAULT_COUNT = 60;
const DEFAULT_WINDOW_SECONDS = 90;
const DEFAULT_BASE_URL = "http://localhost:3000";

const FIRST_NAMES = [
  "Marta", "Bartek", "Núria", "Andrés", "Eszter", "Levente", "Sanne", "Thijs", "Rui", "Inês",
  "Katarzyna", "Piotr", "Javier", "Lucía", "Zsófia", "Gábor", "Femke", "Bram", "Tiago", "Beatriz",
  "Agnieszka", "Michał", "Carmen", "Diego", "Anna", "Máté", "Lotte", "Joris", "Mariana", "Hugo",
];

const STRENGTHS = [
  "Breaking a messy process into steps other people can actually follow",
  "Explicar temas técnicos a clientes sin experiencia previa",
  "Tekla-modellen opschonen zodat de productietekeningen kloppen",
  "Statistical analysis and spotting what a dataset is really saying",
  "Írásos dokumentáció készítése, ami tényleg használható a napi munkában",
  "Automating repetitive office work with small scripts",
  "Negocjowanie terminów z podwykonawcami bez psucia relacji",
  "Onboarding new colleagues so they are productive within a week",
  "Reading a construction drawing and catching errors before fabrication",
  "Estruturar reuniões para que terminem com decisões claras",
  "Building Power BI reports that management actually opens",
  "Troubleshooting steel connection issues under time pressure",
];

const AMBITIONS = [
  "Using AI to cut down the administrative side of my job",
  "Aprender a analizar datos de ventas y detectar tendencias del negocio",
  "Beter worden in het presenteren van technische keuzes aan niet-technische mensen",
  "Writing prompts that give consistent results instead of lucky ones",
  "Szeretnék jobban érteni az automatizálási lehetőségeket a napi folyamatokban",
  "Getting comfortable with Python for small internal tools",
  "Jak lepiej planować projekty, gdy zakres ciągle się zmienia",
  "Turning our scattered documentation into something people trust",
  "Understanding how AI agents can generate training material",
  "Melhorar a forma como damos feedback dentro da equipa",
  "Making our estimates more reliable early in a project",
  "Learning to model complex connections faster in Tekla",
];

function pick<T>(items: readonly T[], index: number) {
  return items[index % items.length];
}

function buildSubmission(index: number, runId: string) {
  return {
    firstName: `${pick(FIRST_NAMES, index)}`,
    country: pick(COUNTRIES, index * 7),
    email: `loadtest+${runId}-${index}@example.invalid`,
    goodAt: pick(STRENGTHS, index * 5),
    wantsToLearn: pick(AMBITIONS, index * 3),
    website: "",
  };
}

function percentile(sortedValues: number[], fraction: number) {
  if (sortedValues.length === 0) return 0;
  return sortedValues[Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * fraction))];
}

async function main() {
  const count = Number(process.argv[2] ?? DEFAULT_COUNT);
  const windowSeconds = Number(process.argv[3] ?? DEFAULT_WINDOW_SECONDS);
  const baseUrl = (process.argv[4] ?? process.env.LOADTEST_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  if (!Number.isInteger(count) || count < 1) throw new Error("Count must be a positive integer.");
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) throw new Error("Window must be a positive number of seconds.");

  const runId = Date.now().toString(36);
  const gapMs = (windowSeconds * 1000) / count;
  const outcomes = { accepted: 0, rateLimited: 0, rejected: 0, unavailable: 0, failed: 0 };
  const latencies: number[] = [];
  const startedAt = Date.now();

  console.log(`Firing ${count} submissions at ${baseUrl}/api/submit over ${windowSeconds}s (one every ${Math.round(gapMs)}ms).`);

  const pending: Promise<void>[] = [];
  for (let index = 0; index < count; index += 1) {
    const dueAt = startedAt + index * gapMs;
    const wait = dueAt - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    pending.push((async () => {
      const requestStartedAt = Date.now();
      try {
        const response = await fetch(`${baseUrl}/api/submit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildSubmission(index, runId)),
        });
        latencies.push(Date.now() - requestStartedAt);
        if (response.ok) outcomes.accepted += 1;
        else if (response.status === 429) outcomes.rateLimited += 1;
        else if (response.status === 400) outcomes.rejected += 1;
        else outcomes.unavailable += 1;
      } catch {
        latencies.push(Date.now() - requestStartedAt);
        outcomes.failed += 1;
      }
    })());
  }

  await Promise.all(pending);
  const sorted = [...latencies].sort((left, right) => left - right);
  console.log(`Elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`Outcomes: ${JSON.stringify(outcomes)}`);
  console.log(`Latency: p50 ${percentile(sorted, 0.5)}ms · p95 ${percentile(sorted, 0.95)}ms · max ${sorted.at(-1) ?? 0}ms`);
  if (outcomes.accepted !== count) {
    console.error("Not every submission was accepted. Investigate before the event.");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
