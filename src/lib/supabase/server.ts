import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Uses the anon key + the caller's session cookie, so every query still
// goes through RLS as that user. Never swap this for the service-role key.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — a middleware refresh handles
            // session persistence, so this can be safely ignored.
          }
        },
      },
    },
  );
}
