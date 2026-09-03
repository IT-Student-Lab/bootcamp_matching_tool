import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { z } from "zod";
import { normalizePersonKey, splitDisplayName } from "../src/lib/participants/person-key";

const MINIMUM_ROWS = 15;
const DOCS_DIR = "docs";
const FALLBACK_FILE = path.join(DOCS_DIR, "Survey results Construsoft.xlsx");
// Test/gibberish submissions in the export, excluded by invitee_id so the reason stays auditable.
const EXCLUDED_INVITEE_IDS = new Map<string, string>([
  ["2", "test submission ('45y' / 'ghgh')"],
  ["35", "test submission ('dxfbhdxthe')"],
  ["176", "test submission ('.')"],
]);
const headerAliases = {
  inviteeId: ["invitee_id", "invitee id", "id"],
  name: ["invitee_name", "invitee name", "name"],
  goodAt: ["what are you genuinely good at", "1.   What's something you're genuinely good at? It could be a skill a way of working or something that you are very confident with using.", "good_at", "good at"],
  wantsToLearn: ["what would you like to learn", "2.   What’s one work-related skill, tool or topic you’d like to learn more about?", "wants_to_learn", "wants to learn"],
} as const;
const seedRowSchema = z.object({ inviteeId: z.string().trim(), name: z.string().trim().min(1), goodAt: z.string().trim().min(1), wantsToLearn: z.string().trim().min(1) });
function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[?!.:]+$/g, "");
}
function findColumn(headers: Map<string, number>, aliases: readonly string[]) {
  for (const alias of aliases) { const column = headers.get(normalizeHeader(alias)); if (column) return column; }
  throw new Error(`Missing spreadsheet column. Expected one of: ${aliases.join(", ")}`);
}
function cellText(value: ExcelJS.CellValue) {
  if (value && typeof value === "object" && "text" in value) return value.text;
  if (value && typeof value === "object" && "result" in value) return String(value.result ?? "");
  return String(value ?? "");
}
async function readSeedRows(filePath: string) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0]; if (!worksheet) throw new Error("The spreadsheet has no worksheets.");
  const headers = new Map<string, number>(); worksheet.getRow(1).eachCell((cell, column) => { headers.set(normalizeHeader(cellText(cell.value)), column); });
  const columns = { inviteeId: findColumn(headers, headerAliases.inviteeId), name: findColumn(headers, headerAliases.name), goodAt: findColumn(headers, headerAliases.goodAt), wantsToLearn: findColumn(headers, headerAliases.wantsToLearn) };
  const rows: z.infer<typeof seedRowSchema>[] = [];
  const skipped: { name: string; reason: string }[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const candidate = { inviteeId: cellText(row.getCell(columns.inviteeId).value), name: cellText(row.getCell(columns.name).value), goodAt: cellText(row.getCell(columns.goodAt).value), wantsToLearn: cellText(row.getCell(columns.wantsToLearn).value) };
    if (Object.values(candidate).every((value) => value.trim() === "")) return;
    const label = candidate.name.trim() || `row ${rowNumber}`;
    const excluded = EXCLUDED_INVITEE_IDS.get(candidate.inviteeId.trim());
    if (excluded) { skipped.push({ name: label, reason: excluded }); return; }
    if (candidate.goodAt.trim() === "" || candidate.wantsToLearn.trim() === "") { skipped.push({ name: label, reason: "only answered one of the two questions" }); return; }
    rows.push(seedRowSchema.parse(candidate));
  });
  if (rows.length < MINIMUM_ROWS) throw new Error(`Only ${rows.length} usable rows found (minimum ${MINIMUM_ROWS}). Check that ${path.basename(filePath)} is the right export. Import aborted.`);
  const personKeys = rows.map((row) => normalizePersonKey(row.name));
  const duplicates = personKeys.filter((key, index) => personKeys.indexOf(key) !== index);
  if (duplicates.length > 0) throw new Error(`These names normalize to the same person_key: ${[...new Set(duplicates)].join(", ")}. Resolve the ambiguity before importing.`);
  return { rows, skipped };
}
function resolveFile(argument: string | undefined) {
  if (argument) return path.resolve(argument);
  const exports = fs.existsSync(DOCS_DIR) ? fs.readdirSync(DOCS_DIR).filter((name) => /^survey_results_.*\.xlsx$/i.test(name)).sort() : [];
  const latest = exports.at(-1);
  return path.resolve(latest ? path.join(DOCS_DIR, latest) : FALLBACK_FILE);
}
async function main() {
  const positional = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  const filePath = resolveFile(positional[0]);
  const { rows, skipped } = await readSeedRows(filePath);
  const participants = rows.map((row) => { const { firstName, lastName } = splitDisplayName(row.name); return { first_name: firstName, last_name: lastName, country: null, email: null, good_at: row.goodAt, wants_to_learn: row.wantsToLearn, source: "seed", person_key: normalizePersonKey(row.name), seed_import_key: normalizePersonKey(row.name), status: "new", superseded_by: null }; });
  console.log(`Source: ${path.basename(filePath)}`);
  console.log(`Usable rows: ${participants.length}`);
  for (const entry of skipped) console.log(`Skipped: ${entry.name} — ${entry.reason}`);
  if (dryRun) { console.log("Dry run — nothing written."); return; }
  const supabaseUrl = z.url().parse(process.env.SUPABASE_URL); const serviceRoleKey = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await supabase.from("participants").upsert(participants, { onConflict: "seed_import_key", ignoreDuplicates: false });
  if (error) throw error;
  console.log(`Imported ${participants.length} seed participants from ${path.basename(filePath)}.`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
