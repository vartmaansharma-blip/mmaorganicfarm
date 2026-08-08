"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (password.length < 8) {
    redirect(
      "/reset-password?error=Use+a+password+with+at+least+8+characters.",
    );
  }

  if (password !== confirmation) {
    redirect("/reset-password?error=The+two+passwords+do+not+match.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/forgot-password?error=Your+reset+link+expired.+Request+a+new+one.",
    );
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(
      "/reset-password?error=We+could+not+update+the+password.+Try+again.",
    );
  }

  await supabase.auth.signOut();
  redirect("/sign-in?message=Password+updated.+Sign+in+with+your+new+password.");
}
