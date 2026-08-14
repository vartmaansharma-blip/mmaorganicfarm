import { canManageLocations, requireFarmStaff } from "@/lib/farm-dashboard";
import { createCsv, exportDateStamp } from "@/lib/farm-export";
import { MILK_PLAN_DAYS } from "@/lib/milk-plan";

export const runtime = "nodejs";

type PlanRow = {
  delivered_deliveries: number;
  is_test: boolean;
  purchased_deliveries: number;
  start_date: string;
  status: string;
  updated_at: string;
  user_id: string;
  weekly_delivery_items: Array<{
    day_of_week: number;
    product_key: string;
    quantity: number;
  }>;
};

export async function GET() {
  const { role, supabase } = await requireFarmStaff(
    "/farm/exports/customers",
  );

  if (!canManageLocations(role)) {
    return new Response("Manager access is required.", { status: 403 });
  }

  const [profilesResult, areasResult, routesResult, plansResult] =
    await Promise.all([
      supabase
        .from("customer_profiles")
        .select(
          "user_id, full_name, email, phone, address_line, locality, landmark, postal_code, delivery_area_id, delivery_route_id, route_stop_order",
        )
        .order("full_name"),
      supabase.from("delivery_areas").select("id, name"),
      supabase.from("delivery_routes").select("id, name"),
      supabase
        .from("delivery_plans")
        .select(
          "user_id, status, is_test, start_date, purchased_deliveries, delivered_deliveries, updated_at, weekly_delivery_items(day_of_week, product_key, quantity)",
        )
        .order("updated_at", { ascending: false }),
    ]);

  const databaseError = [
    profilesResult.error,
    areasResult.error,
    routesResult.error,
    plansResult.error,
  ].find(Boolean);
  if (databaseError) {
    console.error("Unable to export customers", databaseError.message);
    return new Response("The customer export could not be prepared.", {
      status: 500,
    });
  }

  const areaById = new Map(
    (areasResult.data ?? []).map((area) => [area.id, area.name]),
  );
  const routeById = new Map(
    (routesResult.data ?? []).map((route) => [route.id, route.name]),
  );
  const latestPlanByUser = new Map<string, PlanRow>();
  ((plansResult.data ?? []) as PlanRow[]).forEach((plan) => {
    if (!latestPlanByUser.has(plan.user_id)) {
      latestPlanByUser.set(plan.user_id, plan);
    }
  });

  const rows = [
    [
      "Customer",
      "Phone",
      "Email",
      "Address",
      "Locality",
      "Landmark",
      "Postal code",
      "Area",
      "Route",
      "Stop order",
      "Plan status",
      "Mode",
      "Plan start",
      "Deliveries remaining",
      ...MILK_PLAN_DAYS.map((day) => `${day.label} milk (L)`),
    ],
    ...(profilesResult.data ?? []).map((profile) => {
      const plan = latestPlanByUser.get(profile.user_id);
      const remaining = plan
        ? Math.max(
            0,
            Number(plan.purchased_deliveries) -
              Number(plan.delivered_deliveries),
          )
        : "";
      const milkByDay = new Map(
        (plan?.weekly_delivery_items ?? [])
          .filter((item) => item.product_key === "milk")
          .map((item) => [Number(item.day_of_week), Number(item.quantity)]),
      );

      return [
        profile.full_name ?? "Customer",
        profile.phone,
        profile.email,
        profile.address_line,
        profile.locality,
        profile.landmark,
        profile.postal_code,
        profile.delivery_area_id
          ? areaById.get(profile.delivery_area_id)
          : "",
        profile.delivery_route_id
          ? routeById.get(profile.delivery_route_id)
          : "",
        profile.route_stop_order,
        plan?.status ?? "No plan",
        plan ? (plan.is_test ? "Test" : "Live") : "",
        plan?.start_date ?? "",
        remaining,
        ...MILK_PLAN_DAYS.map((_, index) => milkByDay.get(index + 1) ?? 0),
      ];
    }),
  ];

  return new Response(createCsv(rows), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="mma-customers-${exportDateStamp()}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
