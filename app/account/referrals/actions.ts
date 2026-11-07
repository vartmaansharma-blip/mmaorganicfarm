"use server";

import { redirect } from "next/navigation";
import { normalizeReferralCode } from "@/lib/referrals";
import { createClient } from "@/lib/supabase/server";

const path = "/account/referrals";

async function referralClient(code?: string) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    const next = code ? `${path}?code=${code}` : path;
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  return client;
}

export async function createReferralCode() {
  const client = await referralClient();
  const { error } = await client.rpc("create_referral_code");
  redirect(error ? `${path}?error=Your+code+could+not+be+created.+Try+again.` : path);
}

export async function claimReferralCode(form: FormData) {
  const code = normalizeReferralCode(form.get("code"));
  if (!code) redirect(`${path}?error=Enter+a+valid+referral+code.`);
  const client = await referralClient(code);
  const { error } = await client.rpc("claim_referral_code", { p_code: code });
  const messages: Record<string, string> = {
    "Referrals are paused": "Referrals are paused.",
    "Use a valid code from someone else": "Use a valid code from someone else.",
    "Apply your code before starting your first payment": "Apply your code before starting your first payment.",
    "A referral code is already linked to this account": "A referral code is already linked to your account.",
  };
  if (error) redirect(`${path}?error=${encodeURIComponent(messages[error.message] ?? "The code could not be applied. Try again.")}`);
  redirect(`${path}?message=Referral+code+linked.`);
}
