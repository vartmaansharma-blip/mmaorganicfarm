"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requestOrigin() {
  const headerStore = await headers();
  return (
    headerStore.get("origin") ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://mmaorganicfarm-tvn8.vercel.app"
  );
}

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/forgot-password?error=Enter+your+email+address.");
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    redirect(
      `/forgot-password?error=${encodeURIComponent(
        "We could not send the reset email. Please wait a minute and try again.",
      )}`,
    );
  }

  redirect(
    "/forgot-password?message=Check+your+email+for+a+secure+password+reset+link.",
  );
}
