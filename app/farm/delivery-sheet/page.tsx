import type { Metadata } from "next";
import Link from "next/link";
import {
  formatCalendarDate,
  nextDeliveryDateInIndia,
  productName,
} from "@/lib/delivery-calendar";
import { resolveDeliveryArea } from "@/lib/delivery-area";
import { requireFarmStaff } from "@/lib/farm-dashboard";
import { PrintSheetButton } from "./print-button";
import styles from "./sheet.module.css";

export const metadata: Metadata = {
  title: "Daily delivery sheet",
  robots: { index: false, follow: false },
};

type DeliveryRow = {
  address_snapshot: string | null;
  bottle_choice: "new" | "none" | "return";
  customer_name: string;
  daily_delivery_items: Array<{
    product_key: string;
    quantity: number;
    unit: string;
  }>;
  delivery_area_id: string | null;
  delivery_route_id: string | null;
  id: string;
  phone_snapshot: string | null;
  route_stop_order: number | null;
  status: string;
};

function validDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function quantityLabel(item: DeliveryRow["daily_delivery_items"][number]) {
  const quantity = Number(item.quantity);
  return /^1\s/.test(item.unit)
    ? `${quantity} × ${item.unit}`
    : `${quantity} ${item.unit}${quantity === 1 ? "" : "s"}`;
}

function mapsUrl(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function phoneUrl(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

export default async function DeliverySheetPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string; date?: string }>;
}) {
  const { supabase } = await requireFarmStaff("/farm/delivery-sheet");
  const params = await searchParams;
  const deliveryDate = validDate(params.date) ?? nextDeliveryDateInIndia();
  const selectedArea = params.area ?? "";

  const deliveriesQuery = supabase
    .from("daily_deliveries")
    .select(
      "id, status, customer_name, phone_snapshot, address_snapshot, bottle_choice, delivery_area_id, delivery_route_id, route_stop_order, daily_delivery_items(product_key, quantity, unit)",
    )
    .eq("delivery_date", deliveryDate);

  const [deliveriesResult, areasResult] = await Promise.all([
    deliveriesQuery,
    supabase
      .from("delivery_areas")
      .select("id, name, active, sort_order")
      .order("sort_order")
      .order("name"),
  ]);

  const databaseError = [deliveriesResult.error, areasResult.error].find(Boolean);
  if (databaseError) throw databaseError;

  const deliveryAreas = areasResult.data ?? [];
  const deliveries = ((deliveriesResult.data ?? []) as DeliveryRow[]).filter(
    (delivery) =>
      !selectedArea ||
      resolveDeliveryArea(
        delivery.delivery_area_id,
        delivery.address_snapshot,
        deliveryAreas,
      )?.id === selectedArea,
  );
  const grouped = new Map<string, DeliveryRow[]>();
  const totals = new Map<string, number>();

  deliveries.forEach((delivery) => {
    const areaName =
      resolveDeliveryArea(
        delivery.delivery_area_id,
        delivery.address_snapshot,
        deliveryAreas,
      )?.name ?? "Address needs checking";
    const areaStops = grouped.get(areaName) ?? [];
    areaStops.push(delivery);
    grouped.set(areaName, areaStops);

    (delivery.daily_delivery_items ?? []).forEach((item) => {
      totals.set(
        item.product_key,
        (totals.get(item.product_key) ?? 0) + Number(item.quantity),
      );
    });
  });

  const areas = [...grouped.entries()]
    .map(([name, stops]) => ({
      name,
      stops: stops.sort(
        (a, b) => {
          const savedOrder =
            (a.route_stop_order ?? Number.MAX_SAFE_INTEGER) -
            (b.route_stop_order ?? Number.MAX_SAFE_INTEGER);
          if (savedOrder !== 0) return savedOrder;

          const addressOrder = (a.address_snapshot ?? "").localeCompare(
            b.address_snapshot ?? "",
            "en-IN",
            { sensitivity: "base" },
          );
          return addressOrder || a.customer_name.localeCompare(b.customer_name);
        },
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>M&apos;ma Organic Farm</p>
          <h1>Daily delivery sheet</h1>
          <span>{formatCalendarDate(deliveryDate)}</span>
        </div>
        <div className={styles.actions}>
          <PrintSheetButton />
          <Link href="/farm">Back to dashboard</Link>
        </div>
      </header>

      <form action="/farm/delivery-sheet" className={styles.filters} method="get">
        <label>
          <span>Delivery date</span>
          <input defaultValue={deliveryDate} name="date" type="date" />
        </label>
        <label>
          <span>Area</span>
          <select defaultValue={selectedArea} name="area">
            <option value="">All areas</option>
            {deliveryAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Apply</button>
      </form>

      <section className={styles.summary} aria-label="Delivery totals">
        <div><strong>{deliveries.length}</strong><span>Customer stops</span></div>
        {[...totals.entries()].map(([key, quantity]) => (
          <div key={key}>
            <strong>{quantity}</strong>
            <span>{productName(key)}</span>
          </div>
        ))}
      </section>

      {areas.length ? (
        <div className={styles.areaList}>
          {areas.map((area) => (
            <section className={styles.area} key={area.name}>
              <header>
                <h2>{area.name}</h2>
                <span>
                  {area.stops.length} stops
                </span>
              </header>
                <div className={styles.route}>
                  <table>
                    <thead>
                      <tr>
                        <th>Stop</th><th>Where to go</th><th>What to deliver</th><th>Done</th>
                      </tr>
                    </thead>
                    <tbody>
                      {area.stops.map((stop, index) => (
                        <tr key={stop.id}>
                          <td><strong>{index + 1}</strong></td>
                          <td>
                            <strong>{stop.customer_name}</strong>
                            {stop.phone_snapshot ? (
                              <a className={styles.phoneLink} href={phoneUrl(stop.phone_snapshot)}>
                                Call {stop.phone_snapshot}
                              </a>
                            ) : (
                              <span>No phone saved</span>
                            )}
                            {stop.address_snapshot ? (
                              <a
                                className={styles.mapLink}
                                href={mapsUrl(stop.address_snapshot)}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {stop.address_snapshot}
                                <small>Open in Maps ↗</small>
                              </a>
                            ) : (
                              <strong className={styles.missing}>ADDRESS MISSING</strong>
                            )}
                          </td>
                          <td>
                            {(stop.daily_delivery_items ?? []).map((item) => (
                              <span key={item.product_key}>
                                {productName(item.product_key)} · {quantityLabel(item)}
                              </span>
                            ))}
                            {stop.bottle_choice !== "none" ? (
                              <span>
                                Bottle · {stop.bottle_choice === "new" ? "Take new" : "Collect return"}
                              </span>
                            ) : null}
                          </td>
                          <td className={styles.checkCell}>□</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
            </section>
          ))}
        </div>
      ) : (
        <section className={styles.empty}>
          <strong>No delivery sheet for this date.</strong>
          <p>Generate the daily sheet from the farm dashboard first.</p>
        </section>
      )}

      <footer className={styles.footer}>
        Customer information is provided only for completing farm deliveries.
      </footer>
    </main>
  );
}
