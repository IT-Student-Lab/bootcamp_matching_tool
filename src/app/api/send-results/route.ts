import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { Resend } from "resend";
import { z } from "zod";

import { getAdminEnv, getEmailEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

export const maxDuration = 300;
const BATCH_SIZE = 100;
const FROM_ADDRESS = "Construsoft Bootcamp <bootcamp@joda-ai.nl>";

type Participant = { id: string; first_name: string; country: string | null; email: string | null; good_at: string; wants_to_learn: string };
type CandidateMatch = { id: string; participant_a: string; participant_b: string; reason: string };
type Assignment = { participant_id: string; match_id: string };

function authorized(provided: string | null) {
  const expected = getAdminEnv().ADMIN_PASSWORD;
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function emailHtml(recipient: Participant, match: Participant, reason: string) {
  const name = escapeHtml(match.first_name);
  const country = escapeHtml(match.country ?? "Construsoft colleague");
  return `<!doctype html><html><body style="margin:0;background:#f9f4ee;color:#141210;font-family:Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:40px 24px"><p style="font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#6e6a64">Construsoft Bootcamp · Live Matchmaker</p><h1 style="font-size:30px;line-height:1.15;margin:20px 0 8px">Hi ${escapeHtml(recipient.first_name)}, meet ${name}.</h1><p style="color:#6e6a64;margin:0 0 28px">${country}</p><div style="background:#141210;color:#f9f4ee;border-radius:8px;padding:24px"><p style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#c4f084;margin:0 0 6px">Good at</p><p style="font-size:17px;line-height:1.45;margin:0 0 22px">${escapeHtml(match.good_at)}</p><p style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#c4f084;margin:0 0 6px">Would like to learn</p><p style="font-size:17px;line-height:1.45;margin:0">${escapeHtml(match.wants_to_learn)}</p></div><p style="font-size:16px;font-style:italic;line-height:1.5;margin:24px 0">“${escapeHtml(reason)}”</p><p style="color:#6e6a64;font-size:14px;line-height:1.5">Find each other during the break and start the conversation.</p></div></body></html>`;
}

const SAMPLE_RECIPIENT: Participant = { id: "sample-a", first_name: "Yhore", country: "Spain", email: null, good_at: "Coordinating suppliers under a tight schedule", wants_to_learn: "Analyzing sales data and identifying business trends in Power BI" };
const SAMPLE_COUNTERPART: Participant = { id: "sample-b", first_name: "Sasja", country: "Netherlands", email: null, good_at: "Analysis, statistics and understanding what data really means", wants_to_learn: "Presenting findings to a wider audience" };
const SAMPLE_REASON = "Strong analytical methods transfer directly to finding meaningful trends in sales data.";

// Uses the strongest real match so the test mail exercises the same template as the real send.
async function buildPreview(supabase: ReturnType<typeof createServiceClient>) {
  const matchResult = await supabase.from("matches").select("participant_a,participant_b,reason").order("score", { ascending: false }).limit(1);
  const best = matchResult.data?.[0];
  if (matchResult.error || !best) return { recipient: SAMPLE_RECIPIENT, counterpart: SAMPLE_COUNTERPART, reason: SAMPLE_REASON };
  const people = await supabase.from("participants").select("id,first_name,country,email,good_at,wants_to_learn").in("id", [best.participant_a, best.participant_b]);
  const byId = new Map((people.data as Participant[] | null ?? []).map((person) => [person.id, person]));
  const counterpart = byId.get(best.participant_a);
  const recipient = byId.get(best.participant_b);
  if (!counterpart || !recipient) return { recipient: SAMPLE_RECIPIENT, counterpart: SAMPLE_COUNTERPART, reason: SAMPLE_REASON };
  return { recipient, counterpart, reason: best.reason };
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request.headers.get("x-admin-password"))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const supabase = createServiceClient();

    const requestBody = await request.json().catch(() => ({}));
    const testEmail = z.email().safeParse((requestBody as { testEmail?: unknown }).testEmail);
    if (testEmail.success) {
      const preview = await buildPreview(supabase);
      const sent = await new Resend(getEmailEnv().RESEND_API_KEY).emails.send({
        from: FROM_ADDRESS,
        to: testEmail.data,
        subject: `Test - your Bootcamp match: ${preview.counterpart.first_name}`,
        html: emailHtml(preview.recipient, preview.counterpart, preview.reason),
      });
      if (sent.error) return NextResponse.json({ ok: false, error: sent.error.name, message: sent.error.message });
      return NextResponse.json({ ok: true, test: true, from: FROM_ADDRESS, messageId: sent.data?.id });
    }

    const assignmentResult = await supabase.from("final_assignments").select("participant_id,match_id").eq("status", "matched").eq("email_status", "pending").not("match_id", "is", null);
    if (assignmentResult.error) throw assignmentResult.error;
    const assignments = assignmentResult.data as Assignment[];
    if (assignments.length === 0) return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: true });

    const [participantResult, matchResult] = await Promise.all([
      supabase.from("participants").select("id,first_name,country,email,good_at,wants_to_learn").is("superseded_by", null),
      supabase.from("matches").select("id,participant_a,participant_b,reason").in("id", [...new Set(assignments.map((assignment) => assignment.match_id))]),
    ]);
    if (participantResult.error) throw participantResult.error;
    if (matchResult.error) throw matchResult.error;
    const participants = new Map((participantResult.data as Participant[]).map((participant) => [participant.id, participant]));
    const matches = new Map((matchResult.data as CandidateMatch[]).map((match) => [match.id, match]));
    const ready = assignments.flatMap((assignment) => {
      const recipient = participants.get(assignment.participant_id);
      const match = matches.get(assignment.match_id);
      if (!recipient?.email || !match) return [];
      const counterpartId = match.participant_a === recipient.id ? match.participant_b : match.participant_a;
      const counterpart = participants.get(counterpartId);
      return counterpart ? [{ assignment, recipient, counterpart, reason: match.reason }] : [];
    });
    const resend = new Resend(getEmailEnv().RESEND_API_KEY);
    let sent = 0;
    let failed = 0;

    for (let offset = 0; offset < ready.length; offset += BATCH_SIZE) {
      const chunk = ready.slice(offset, offset + BATCH_SIZE);
      const claim = await supabase.from("final_assignments").update({ email_status: "sending", updated_at: new Date().toISOString() }).in("participant_id", chunk.map((item) => item.recipient.id)).eq("email_status", "pending");
      if (claim.error) throw claim.error;
      const idempotencyKey = `bootcamp-results-${createHash("sha256").update(chunk.map((item) => item.recipient.id).sort().join(":" )).digest("hex").slice(0, 32)}`;
      const response = await resend.batch.send(chunk.map((item) => ({
        from: FROM_ADDRESS,
        to: item.recipient.email!,
        subject: `Your Bootcamp match: ${item.counterpart.first_name}`,
        html: emailHtml(item.recipient, item.counterpart, item.reason),
      })), { batchValidation: "permissive", idempotencyKey });

      if (response.error) {
        failed += chunk.length;
        await supabase.from("final_assignments").update({ email_status: "failed", email_error_code: response.error.name, updated_at: new Date().toISOString() }).in("participant_id", chunk.map((item) => item.recipient.id));
        continue;
      }
      const errors = new Map((response.data?.errors ?? []).map((error) => [error.index, error.message]));
      let successIndex = 0;
      for (let index = 0; index < chunk.length; index += 1) {
        const item = chunk[index];
        const error = errors.get(index);
        const update = error
          ? { email_status: "failed", email_error_code: error.slice(0, 120), updated_at: new Date().toISOString() }
          : { email_status: "sent", email_message_id: response.data!.data[successIndex++]?.id ?? null, email_error_code: null, updated_at: new Date().toISOString() };
        const updateResult = await supabase.from("final_assignments").update(update).eq("participant_id", item.recipient.id);
        if (updateResult.error) throw updateResult.error;
        if (error) failed += 1; else sent += 1;
      }
    }

    return NextResponse.json({ ok: true, sent, failed, skippedInvalid: assignments.length - ready.length });
  } catch (error) {
    console.error("send_results_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "send_failed" }, { status: 200 });
  }
}