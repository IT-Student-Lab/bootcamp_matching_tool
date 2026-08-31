import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAdminEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

const requestSchema = z.object({ action: z.enum(["reset_matches", "delete_live", "start_seed_demo"]) });

function authorized(provided: string | null) {
  const expected = getAdminEnv().ADMIN_PASSWORD;
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function resetMatches(forceVersion?: number) {
  const supabase = createServiceClient();
  const controlUpdate: { forced_match_id: null; updated_at: string; force_version?: number; mode?: "live" } = {
    forced_match_id: null,
    updated_at: new Date().toISOString(),
  };
  if (forceVersion !== undefined) {
    controlUpdate.force_version = forceVersion;
    controlUpdate.mode = "live";
  }
  const control = await supabase.from("show_control").update(controlUpdate).eq("id", 1).select().single();
  if (control.error) throw control.error;
  const assignmentDelete = await supabase.from("final_assignments").delete().not("participant_id", "is", null);
  if (assignmentDelete.error) throw assignmentDelete.error;
  const publicDelete = await supabase.from("public_matches").delete().not("match_id", "is", null);
  if (publicDelete.error) throw publicDelete.error;
  const matchDelete = await supabase.from("matches").delete().not("id", "is", null);
  if (matchDelete.error) throw matchDelete.error;
  const statusReset = await supabase.from("participants").update({ status: "new", updated_at: new Date().toISOString() }).is("superseded_by", null);
  if (statusReset.error) throw statusReset.error;
  return { matchesDeleted: true, forceVersion: control.data.force_version };
}

async function deleteLiveParticipants() {
  const supabase = createServiceClient();
  const liveResult = await supabase.from("participants").select("id").eq("source", "live");
  if (liveResult.error) throw liveResult.error;
  const liveIds = liveResult.data.map((participant) => participant.id);
  if (liveIds.length === 0) return { liveDeleted: 0 };

  const seedRestore = await supabase.from("participants").update({ superseded_by: null, updated_at: new Date().toISOString() }).in("superseded_by", liveIds);
  if (seedRestore.error) throw seedRestore.error;
  const publicMatchDelete = await supabase.from("public_matches").delete().or(`participant_a.in.(${liveIds.join(",")}),participant_b.in.(${liveIds.join(",")})`);
  if (publicMatchDelete.error) throw publicMatchDelete.error;
  const matchDelete = await supabase.from("matches").delete().or(`participant_a.in.(${liveIds.join(",")}),participant_b.in.(${liveIds.join(",")})`);
  if (matchDelete.error) throw matchDelete.error;
  const nodeDelete = await supabase.from("public_nodes").delete().in("participant_id", liveIds);
  if (nodeDelete.error) throw nodeDelete.error;
  const participantDelete = await supabase.from("participants").delete().in("id", liveIds);
  if (participantDelete.error) throw participantDelete.error;
  return { liveDeleted: liveIds.length };
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request.headers.get("x-admin-password"))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });

    if (parsed.data.action === "delete_live") return NextResponse.json({ ok: true, ...(await deleteLiveParticipants()) });
    const seedDemoVersion = parsed.data.action === "start_seed_demo" ? Date.now() : undefined;
    const reset = await resetMatches(seedDemoVersion);
    if (parsed.data.action === "reset_matches") return NextResponse.json({ ok: true, ...reset });
    return NextResponse.json({ ok: true, ...reset, seedDemoVersion: reset.forceVersion });
  } catch (error) {
    console.error("admin_data_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "operation_failed" }, { status: 200 });
  }
}