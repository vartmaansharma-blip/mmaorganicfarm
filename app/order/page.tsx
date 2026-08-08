import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { saveDeliveryDetails } from "./actions";
import styles from "./order.module.css";

export const metadata: Metadata = {
  title: "Start your milk order",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type OrderPageProps = {
  searchParams: Promise<{ error?: string }>;
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={66} height={56} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link className={styles.back} href="/#milk">
          Back to milk
        </Link>
      </header>

      <section className={styles.layout}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>Step 2 of 3</p>
          <h1>Where should we bring your milk, {firstName}?</h1>
          <p>
            Add a contact number and delivery address. You will confirm what you
            need personally on WhatsApp.
          </p>
          <div className={styles.steps} aria-label="Order progress">
            <span className={styles.complete}>Account</span>
            <span className={styles.active}>Delivery details</span>
            <span>WhatsApp confirmation</span>
          </div>
        </div>

        <form className={styles.form} action={saveDeliveryDetails}>
          {params.error ? (
            <p className={styles.error} role="alert">
              {params.error}
            </p>
          ) : null}

          <label>
            Phone number for delivery updates
            <input
              autoComplete="tel"
              defaultValue={profile?.phone ?? ""}
              inputMode="tel"
              maxLength={16}
              name="phone"
              placeholder="+91 10-digit mobile number"
              required
              type="tel"
            />
          </label>

          <label>
            Delivery address
            <textarea
              autoComplete="street-address"
              defaultValue={profile?.address_line ?? ""}
              name="address"
              placeholder="House or flat, street, area and landmark"
              required
              rows={5}
            />
          </label>

          <div className={styles.city}>
            <span>Delivery city</span>
            <strong>Jamshedpur</strong>
          </div>

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
