import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import styles from "./account.module.css";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("customer_profiles")
    .select("full_name, email, avatar_url, phone, address_line, city, postal_code")
    .eq("user_id", user.id)
    .maybeSingle();

  const name = profile?.full_name ?? user.user_metadata.full_name ?? "Customer";
  const email = profile?.email ?? user.email ?? "";
  const googleConnected = user.identities?.some(
    (identity) => identity.provider === "google",
  );

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

      <section className={styles.content}>
        <p className={styles.eyebrow}>Customer account</p>
        <h1>Welcome, {name.split(/\s+/)[0]}.</h1>
        <p className={styles.intro}>
          Your account keeps your contact and delivery details ready for a
          faster order.
        </p>

        <Link className={styles.startOrder} href="/order">
          Start a milk order <span>→</span>
        </Link>

        <div className={styles.profile}>
          {profile?.avatar_url ? (
            <Image
              className={styles.avatar}
              src={profile.avatar_url}
              alt=""
              width={72}
              height={72}
              unoptimized
            />
          ) : (
            <span className={styles.avatarFallback} aria-hidden="true">
              {name.charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <strong>{name}</strong>
            <span>{email}</span>
          </div>
          <span className={styles.status}>
            {googleConnected ? "Google connected" : "Email account"}
          </span>
        </div>

        <dl className={styles.details}>
          <div>
            <dt>Phone</dt>
            <dd>{profile?.phone || "Add when placing your first order"}</dd>
          </div>
          <div>
            <dt>Delivery address</dt>
            <dd>
              {profile?.address_line
                ? [profile.address_line, profile.city, profile.postal_code]
                    .filter(Boolean)
                    .join(", ")
                : "Add when placing your first order"}
            </dd>
          </div>
        </dl>

        <form action={signOut}>
          <button className={styles.signOut} type="submit">
            Sign out
          </button>
        </form>
      </section>
    </main>
  );
}
