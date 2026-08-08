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
    .select("full_name, email, avatar_url, phone, address_line, postal_code")
    .eq("user_id", user.id)
    .maybeSingle();

  const name = profile?.full_name ?? user.user_metadata.full_name ?? "Customer";
  const email = profile?.email ?? user.email ?? "";
  const googleConnected = user.identities?.some(
    (identity) => identity.provider === "google",
  );
  const hasPhone = Boolean(profile?.phone?.trim());
  const hasAddress = Boolean(profile?.address_line?.trim());
  const hasDeliveryDetails = hasPhone || hasAddress;

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
        <div className={styles.pageHeading}>
          <div>
            <p className={styles.eyebrow}>
              Welcome, {name.split(/\s+/)[0]}
            </p>
            <h1>Your account</h1>
            <p className={styles.intro}>
              Manage the details used for your M&apos;ma milk orders.
            </p>
          </div>
          <Link className={styles.startOrder} href="/order">
            Start an order
          </Link>
        </div>

        <section className={styles.accountSection} aria-labelledby="profile-heading">
          <div className={styles.sectionHeading}>
            <h2 id="profile-heading">Profile</h2>
            <p>Your sign-in identity and delivery contact information.</p>
          </div>

          <div className={styles.profile}>
            {profile?.avatar_url ? (
              <Image
                className={styles.avatar}
                src={profile.avatar_url}
                alt=""
                width={56}
                height={56}
                unoptimized
              />
            ) : (
              <span className={styles.avatarFallback} aria-hidden="true">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className={styles.identity}>
              <strong>{name}</strong>
              <span>{email}</span>
            </div>
            <span className={styles.status}>
              {googleConnected ? "Google connected" : "Email account"}
            </span>
          </div>

          {hasDeliveryDetails ? (
            <dl className={styles.details}>
              {hasPhone ? (
                <div>
                  <dt>Phone</dt>
                  <dd>{profile?.phone}</dd>
                </div>
              ) : null}
              {hasAddress ? (
                <div>
                  <dt>Delivery address</dt>
                  <dd>
                    {[profile?.address_line, profile?.postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <Link className={styles.editDetails} href="/order">
            {hasDeliveryDetails ? "Update delivery details" : "Add delivery details"}
          </Link>
        </section>

        <div className={styles.accountFooter}>
          <span>Signed in as {email}</span>
          <form action={signOut}>
            <button className={styles.signOut} type="submit">
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
