import { createHmac } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { normalizePersonKey } from "@/lib/participants/person-key";
import { createServiceClient } from "@/lib/supabase/server";

const MAX_REQUESTS_PER_HOUR = 5;
const submissionSchema = z.object({
  firstName: z.string().trim().min(1).max(80), country: z.string().trim().min(1).max(80),
  email: z.email().max(254).transform((value) => value.trim().toLocaleLowerCase("en")),
  goodAt: z.string().trim().min(1).max(300), wantsToLearn: z.string().trim().min(1).max(300),
  website: z.string().max(0).optional().default(""),
});

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}
function getHourlyWindow(date: Date) { const window = new Date(date); window.setUTCMinutes(0, 0, 0); return window.toISOString(); }

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  const parsed = submissionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_submission" }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ ok: true });

  try {
    const env = getServerEnv();
    const supabase = createServiceClient();
    const keyHash = createHmac("sha256", env.RATE_LIMIT_SECRET).update(getClientIp(request)).digest("hex");
    const { data: accepted, error: rateLimitError } = await supabase.rpc("consume_rate_limit", { bucket_key_hash: keyHash, bucket_started_at: getHourlyWindow(new Date()), maximum_requests: MAX_REQUESTS_PER_HOUR });
    if (rateLimitError) throw rateLimitError;
    if (!accepted) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    const { error } = await supabase.rpc("submit_live_participant", {
      submitted_first_name: parsed.data.firstName, submitted_country: parsed.data.country,
      submitted_email: parsed.data.email, submitted_good_at: parsed.data.goodAt,
      submitted_wants_to_learn: parsed.data.wantsToLearn,
      submitted_name_key: normalizePersonKey(parsed.data.firstName), submitted_email_key: `email:${parsed.data.email}`,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("submit_failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
}
