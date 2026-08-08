"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function signInUrl(type: "error" | "message", message: string, mode = "sign-in") {
  return `/sign-in?mode=${mode}&${type}=${encodeURIComponent(message)}`;
}

function ensureSupabaseIsReady(mode = "sign-in") {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    redirect(
      signInUrl(
        "message",
        "Customer accounts are being connected. Please order through WhatsApp for now.",
        mode,
      ),
    );
  }
}

async function requestOrigin() {
  const headerStore = await headers();
  const origin = headerStore.get("origin");

  if (origin) return origin;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3001";
}

async function saveProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase.from("customer_profiles").upsert(
    {
      user_id: user.id,
      full_name: user.user_metadata.full_name ?? user.user_metadata.name ?? null,
      email: user.email ?? null,
      avatar_url: user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
    },
    { onConflict: "user_id" },
  );
}

export async function signInWithGoogle() {
  ensureSupabaseIsReady();
  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error || !data.url) {
    redirect(signInUrl("error", "Google sign-in is not available yet."));
  }

  redirect(data.url);
}

export async function signInWithEmail(formData: FormData) {
  ensureSupabaseIsReady();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(signInUrl("error", "Enter your email and password."));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(signInUrl("error", "That email or password did not match."));
  }

  await saveProfile();
  redirect("/#milk");
}

export async function signUpWithEmail(formData: FormData) {
  ensureSupabaseIsReady("sign-up");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!fullName || !email || password.length < 8) {
    redirect(
      signInUrl(
        "error",
        "Add your name, email, and a password with at least 8 characters.",
        "sign-up",
      ),
    );
  }

  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    redirect(signInUrl("error", error.message, "sign-up"));
  }

  if (data.session) {
    await saveProfile();
    redirect("/#milk");
  }

  redirect(
    signInUrl(
      "message",
      "Check your email to finish creating your account.",
      "sign-up",
    ),
  );
}
