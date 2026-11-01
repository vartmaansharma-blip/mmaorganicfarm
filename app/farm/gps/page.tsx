import type { Metadata } from "next";
import Link from "next/link";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { todayInIndia } from "@/lib/delivery-calendar";
import { validOperationalDate } from "@/lib/delivery-operations";
import type { GpsWorkspace } from "@/lib/gps-routing";
import { GpsBoard } from "./gps-board";
import styles from "./gps.module.css";
export const metadata: Metadata = {
  title: "GPS routes · M’ma",
  robots: { index: false, follow: false },
};
export default async function GpsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { supabase } = await requireFarmStaff("/farm/gps");
  const date =
    validOperationalDate((await searchParams).date) ?? todayInIndia();
  const { data, error } = await supabase.rpc("get_gps_workspace", {
    p_date: date,
  });
  if (error) {
    if (
      !["PGRST202", "42883"].includes(error.code) ||
      !/get_gps_workspace/.test(error.message)
    )
      throw error;
    return (
      <main className={styles.page} data-gps-workspace>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>A clearer way forward</p>
            <h1>GPS routes are awaiting activation.</h1>
            <p>
              The GPS database update needs review before activation. Your
              assigned runs and delivery records remain available.
            </p>
            <Link className={styles.primary} href="/farm/runs">
              Open delivery runs ↗
            </Link>
          </div>
        </section>
      </main>
    );
  }
  return (
    <GpsBoard
      initial={data as GpsWorkspace}
      initialNow={Date.parse((data as GpsWorkspace).server_time)}
      providerReady={
        process.env.GPS_ROAD_ROUTING_ENABLED === "true" &&
        Boolean(process.env.GPS_GOOGLE_ROUTES_KEY)
      }
      mapKey={process.env.NEXT_PUBLIC_GPS_MAPS_EMBED_KEY ?? null}
    />
  );
}
