import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type ReferralWorkspace = {
  enabled: boolean;
  referrer_paise: number;
  newcomer_paise: number;
  revision: string;
  code: string | null;
  claim: { reward_paise: number; unlocked: boolean } | null;
  invites: number;
  unlocked_invites: number;
  earned_paise: number;
};

export async function readReferralWorkspace(client: SupabaseClient) {
  const { data, error } = await client.rpc("referral_workspace");
  return error ? null : (data as ReferralWorkspace | null);
}

export const referralsEnabled = cache(async () => {
  const client = await createClient();
  const { data, error } = await client.rpc("referrals_enabled");
  return !error && data === true;
});

export function normalizeReferralCode(value: unknown) {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase();
  return /^[A-F0-9]{32}$/.test(code) ? code : "";
}
