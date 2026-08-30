import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
let browserClient: ReturnType<typeof createClient> | undefined;
export function getBrowserClient() {
  if (!browserClient) { const env = getPublicEnv(); browserClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY); }
  return browserClient;
}
