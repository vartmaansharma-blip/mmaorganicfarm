import { createClient } from "@/lib/supabase/server";
import { loadCustomerDelivery } from "@/lib/customer-delivery-data";

export const dynamic = "force-dynamic";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to see your delivery updates." }, { status: 401, headers });
  try { return Response.json(await loadCustomerDelivery(supabase, user.id), { headers }); }
  catch { return Response.json({ error: "We couldn’t refresh your delivery updates. Please try again." }, { status: 503, headers }); }
}
