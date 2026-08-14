import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FarmStaffRole = "admin" | "driver" | "manager";

export async function requireFarmStaff(next = "/farm") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  const { data: staff } = await supabase
    .from("farm_staff")
    .select("role")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!staff) redirect("/account");

  return {
    role: staff.role as FarmStaffRole,
    supabase,
    user,
  };
}

export function canManageLocations(role: FarmStaffRole) {
  return role === "admin" || role === "manager";
}

export async function requireFarmManager(next = "/farm") {
  const context = await requireFarmStaff(next);

  if (!canManageLocations(context.role)) {
    redirect("/farm/delivery-sheet");
  }

  return context;
}

export function areaSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
