import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. This is the one exception
// CLAUDE.md carves out: "the service-role key is for admin import jobs
// only." Only call this from server actions that have already confirmed
// (via the normal session-bound client) that the caller is an admin, and
// only for operations RLS structurally cannot do — here, creating
// auth.users rows for bulk student import. Never import this from a
// client component; never use it for anything a regular request could do
// through RLS instead.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
