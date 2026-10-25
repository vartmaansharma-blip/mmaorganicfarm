"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireFarmManager } from "@/lib/farm-dashboard";
import { validOperationalDate } from "@/lib/delivery-operations";
export async function retryPreparation(form: FormData) {
  const { supabase } = await requireFarmManager("/farm/activity");
  const date = validOperationalDate(form.get("date"));
  if (!date) redirect("/farm/activity?error=Choose+a+valid+service+date");
  const result = await supabase.rpc("retry_dispatch_preparation", {
    p_date: date,
  });
  revalidatePath("/farm");
  revalidatePath("/farm/activity");
  revalidatePath("/farm/delivery-sheet");
  if (result.error || result.data?.status === "failed")
    redirect(
      "/farm/activity?error=Preparation+failed.+Review+the+recorded+run.",
    );
  redirect(
    "/farm/activity?message=Preparation+reviewed.+Dispatch+release+still+requires+a+manager.",
  );
}
