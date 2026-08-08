import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseFarmProductSelections } from "@/lib/farm-products";
import { saveDeliveryDetails } from "./actions";
import styles from "./order.module.css";

export const metadata: Metadata = {
  title: "Start your farm order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type OrderPageProps = {
  searchParams: Promise<{
    bottle?: "new" | "none" | "return";
    error?: string;
    extras?: string;
    milk?: string;
    purchase?: "once" | "plan";
  }>;
};

export default async function OrderPage({ searchParams }: OrderPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in?next=%2Forder&message=Sign+in+to+continue+your+order.");
  }

  const { data: profile } = await supabase
    .from("customer_profiles")
    .select("full_name, phone, address_line")
    .eq("user_id", user.id)
    .maybeSingle();

  const firstName = (
    profile?.full_name ??
    user.user_metadata.full_name ??
    user.user_metadata.name ??
    "there"
  ).split(/\s+/)[0];
  const selectedProducts = parseFarmProductSelections(params.extras ?? "");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link className={styles.back} href="/milk">
          Back to products
        </Link>
      </header>

      <section className={styles.layout}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Step 2 of 3</p>
          <h1>Where should we bring your order, {firstName}?</h1>
          <p>
            Add a contact number and delivery address. You will confirm what you
            need personally on WhatsApp.
          </p>
          <div className={styles.steps} aria-label="Order progress">
            <span className={styles.complete}>Account</span>
            <span className={styles.active}>Delivery details</span>
            <span>WhatsApp confirmation</span>
          </div>
          {selectedProducts.length ? (
            <div className={styles.orderSummary}>
              <strong>Added to this farm order</strong>
              <ul>
                {selectedProducts.map((product) => (
                  <li key={product.id}>
                    <span>
                      {product.name} · {product.unit}
                    </span>
                    <b>
                      ₹{product.price} · {product.frequency === "weekly" ? "weekly" : "once"}
                    </b>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <form className={styles.form} action={saveDeliveryDetails}>
          <input name="bottle" type="hidden" value={params.bottle ?? "return"} />
          <input name="extras" type="hidden" value={params.extras ?? ""} />
          <input name="milk" type="hidden" value={params.milk ?? "1"} />
          <input name="purchase" type="hidden" value={params.purchase ?? "once"} />
          {params.error ? (
            <p className={styles.error} role="alert">
              {params.error}
            </p>
          ) : null}

          <label>
            <span className={styles.fieldLabel}>Phone number</span>
            <div className={styles.phoneField}>
              <span aria-hidden="true">+91</span>
              <input
                aria-describedby="phone-help"
                autoComplete="tel"
                defaultValue={profile?.phone?.replace(/^\+91/, "") ?? ""}
                inputMode="numeric"
                maxLength={10}
                name="phone"
                pattern="[0-9]{10}"
                placeholder="98765 43210"
                required
                type="tel"
              />
            </div>
            <span className={styles.fieldHelp} id="phone-help">
              Used only for delivery updates.
            </span>
          </label>

          <label>
            <span className={styles.fieldLabel}>Delivery address</span>
            <textarea
              aria-describedby="address-help"
              autoComplete="street-address"
              defaultValue={profile?.address_line ?? ""}
              name="address"
              placeholder="House or flat, street, area and landmark"
              required
              rows={4}
            />
            <span className={styles.fieldHelp} id="address-help">
              Add a landmark only when it helps the delivery team find you.
            </span>
          </label>

          <button type="submit">
            Save &amp; continue to WhatsApp <span>→</span>
          </button>
          <p className={styles.note}>
            These details are saved securely to your account. No order is placed
            and no payment is taken on this page.
          </p>
        </form>
      </section>
    </main>
  );
}
