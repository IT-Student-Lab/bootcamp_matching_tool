import "dotenv/config";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { z } from "zod";
import { normalizePersonKey, splitDisplayName } from "../src/lib/participants/person-key";

const EXPECTED_ROWS = 15;
const DEFAULT_FILE = path.join("docs", "Survey results Construsoft.xlsx");
const headerAliases = {
  name: ["invitee_name", "invitee name", "name"],
  goodAt: ["what are you genuinely good at", "1.   What's something you're genuinely good at? It could be a skill a way of working or something that you are very confident with using.", "good_at", "good at"],
  wantsToLearn: ["what would you like to learn", "2.   What’s one work-related skill, tool or topic you’d like to learn more about?", "wants_to_learn", "wants to learn"],
} as const;
const seedRowSchema = z.object({ name: z.string().trim().min(1), goodAt: z.string().trim().min(1), wantsToLearn: z.string().trim().min(1) });
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
  const columns = { name: findColumn(headers, headerAliases.name), goodAt: findColumn(headers, headerAliases.goodAt), wantsToLearn: findColumn(headers, headerAliases.wantsToLearn) };
  const rows: z.infer<typeof seedRowSchema>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const candidate = { name: cellText(row.getCell(columns.name).value), goodAt: cellText(row.getCell(columns.goodAt).value), wantsToLearn: cellText(row.getCell(columns.wantsToLearn).value) };
    if (Object.values(candidate).every((value) => value.trim() === "")) return;
    rows.push(seedRowSchema.parse(candidate));
  });
  if (rows.length !== EXPECTED_ROWS) throw new Error(`Expected ${EXPECTED_ROWS} seed rows, found ${rows.length}. Import aborted.`);
  const personKeys = rows.map((row) => normalizePersonKey(row.name));
  if (new Set(personKeys).size !== personKeys.length) throw new Error("Two seed rows normalize to the same name. Resolve the ambiguity before importing.");
  return rows;
}
async function main() {
  const filePath = path.resolve(process.argv[2] ?? DEFAULT_FILE); const rows = await readSeedRows(filePath);
  const supabaseUrl = z.url().parse(process.env.SUPABASE_URL); const serviceRoleKey = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const participants = rows.map((row) => { const { firstName, lastName } = splitDisplayName(row.name); return { first_name: firstName, last_name: lastName, country: null, email: null, good_at: row.goodAt, wants_to_learn: row.wantsToLearn, source: "seed", person_key: normalizePersonKey(row.name), seed_import_key: normalizePersonKey(row.name), status: "new", superseded_by: null }; });
  const { error } = await supabase.from("participants").upsert(participants, { onConflict: "seed_import_key", ignoreDuplicates: false });
  if (error) throw error;
  console.log(`Imported ${participants.length} seed participants from ${path.basename(filePath)}.`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
