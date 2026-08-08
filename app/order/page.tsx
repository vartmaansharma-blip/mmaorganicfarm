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
          <p className={styles.eyebrow}>Delivery details</p>
          <h1>Where should we bring your milk, {firstName}?</h1>
          <p>
            Add only the details the farm needs to contact you and identify your
            delivery address. You will confirm the order personally on WhatsApp.
          </p>
          <div className={styles.steps} aria-label="Order progress">
            <span className={styles.complete}>01 Account</span>
            <span className={styles.active}>02 Address</span>
            <span>03 WhatsApp</span>
          </div>
        </div>

        <form className={styles.form} action={saveDeliveryDetails}>
          {params.error ? (
            <p className={styles.error} role="alert">
              {params.error}
            </p>
          ) : null}

          <label>
            Mobile number
            <div className={styles.phoneField}>
              <span>+91</span>
              <input
                autoComplete="tel"
                defaultValue={profile?.phone?.replace(/^\+91/, "") ?? ""}
                inputMode="numeric"
                maxLength={10}
                name="phone"
                pattern="[0-9]{10}"
                placeholder="10-digit mobile number"
                required
                type="tel"
              />
            </div>
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
            This saves your phone and address to your M&apos;ma account. It does
            not place or charge for an order.
          </p>
        </form>
      </section>
    </main>
  );
}
