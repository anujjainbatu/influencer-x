import { createClient } from "@supabase/supabase-js";
import { env, requireServer } from "@/lib/env";

// Service-role client — bypasses RLS. Use only on the server, and only for flows
// that need to read/write rows without a logged-in user session (e.g. the
// public stream proxy validating share-link tokens).
export function createSupabaseAdminClient() {
  return createClient(env.SUPABASE_URL, requireServer("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
