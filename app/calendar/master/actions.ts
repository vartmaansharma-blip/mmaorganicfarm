"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validShopDate } from "@/lib/shop-draft";
import { createClient } from "@/lib/supabase/server";

export async function saveMasterSchedule(form: FormData) {
  const mode = form.get("view") === "weekly" ? "weekly" : "monthly";
  const editDate = mode === "monthly" || form.get("scope") === "date";
  const month = String(form.get("month") ?? "");
  const date = String(form.get("date") ?? "");
  const query = new URLSearchParams({ view: mode });
  if (validShopDate(`${month}-01`)) query.set("month", month);
  if (validShopDate(date)) query.set("date", date);
  const url = `/calendar?${query}`;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(url)}`);

  const revision = Number(form.get("revision"));
  const raw = String(form.get("quantities") ?? "");
  let quantities: unknown;
  try {
    if (!raw || raw.length > 1_000) throw new Error("Invalid quantities");
    quantities = JSON.parse(raw);
  } catch {
    redirect(`${url}&error=Check+your+quantities+and+try+again.`);
  }
  if (!Number.isSafeInteger(revision) || revision < 0 || (editDate && !validShopDate(date)))
    redirect(`${url}&error=This+change+could+not+be+saved.`);

  const { error } = await client.rpc("save_master_delivery_schedule", {
    p_revision: revision, p_date: editDate ? date : null, p_quantities: quantities,
  });
  if (error) {
    const message = error.message.startsWith("Your schedule changed")
      ? "Your schedule changed on another device. Review the latest version."
      : error.message.startsWith("Use the paid delivery controls")
        ? "This date is now part of a paid delivery. Open the paid delivery controls."
        : "Your schedule could not be saved. Check the date and quantities.";
    redirect(`${url}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/calendar");
  redirect(`${url}&message=${editDate ? "This+date+was+saved." : "Weekly+schedule+saved."}`);
}
