import "server-only";
import { dashboardReviewEnabled } from "../dashboard-review-mode";
import { createDashboardReviewClient } from "../dashboard-review/client";
import { createClient } from "@supabase/supabase-js";

export function hasSupabaseAdminConfig() {
  return (
    dashboardReviewEnabled() ||
    Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.SUPABASE_SECRET_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY),
    )
  );
}

export function createAdminClient() {
  if (dashboardReviewEnabled()) return createDashboardReviewClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret)
    throw new Error("Supabase server credentials are not configured.");
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
