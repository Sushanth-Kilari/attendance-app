import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // api/cron is excluded: Vercel Cron calls it with no session cookie at
  // all (it authenticates via its own CRON_SECRET bearer check instead), so
  // running the cookie-based auth redirect here would send every cron
  // invocation to /login and the job would never actually run.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
