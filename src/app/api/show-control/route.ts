import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAdminEnv } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_mode"), mode: z.enum(["live", "fallback"]) }),
  z.object({ action: z.literal("set_floor"), scoreFloor: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal("force_match"), matchId: z.uuid() }),
]);

function authorized(provided: string | null) {
  const expected = getAdminEnv().ADMIN_PASSWORD;
  if (!provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  try {
    if (!authorized(request.headers.get("x-admin-password"))) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    const supabase = createServiceClient();
    const values = parsed.data.action === "set_mode" ? { mode: parsed.data.mode, updated_at: new Date().toISOString() }
      : parsed.data.action === "set_floor" ? { score_floor: parsed.data.scoreFloor, updated_at: new Date().toISOString() }
      : { forced_match_id: parsed.data.matchId, force_version: Date.now(), updated_at: new Date().toISOString() };
    const result = await supabase.from("show_control").update(values).eq("id", 1).select().single();
    if (result.error) throw result.error;
    return NextResponse.json({ ok: true, control: result.data });
  } catch (error) {
    console.error("show_control_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "control_failed" }, { status: 200 });
  }
}