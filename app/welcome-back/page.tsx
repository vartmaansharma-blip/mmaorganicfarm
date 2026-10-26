import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PersonalOfferCode } from "./personal-offer-code";
import styles from "./welcome-back.module.css";

export const metadata: Metadata = {
  title: "Fresh mornings, again · M’ma Organic Farm",
  description:
    "A fresh start for returning customers. Get 5% off the products in your first monthly plan back with your personal welcome-back code.",
  alternates: { canonical: "/welcome-back" },
  openGraph: {
    title: "Fresh mornings, again · M’ma Organic Farm",
    description:
      "5% off the products in your first month back, with your personal one-use code.",
    url: "/welcome-back",
    images: [
      {
        url: "/offers/welcome-back-v1.png",
        width: 1254,
        height: 1254,
        alt: "Fresh mornings, again. 5% off your first month back.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fresh mornings, again · M’ma Organic Farm",
    description: "5% off the products in your first month back.",
    images: ["/offers/welcome-back-v1.png"],
  },
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";
type Offer = {
  code: string;
  state: "available" | "reserved" | "redeemed";
  order_id: string | null;
};

export default async function WelcomeBackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let offer: Offer | null = null;
  let unavailable = false;
  if (user) {
    const { data, error } = await supabase.rpc("my_welcome_back_offer");
    offer = data as Offer | null;
    unavailable = Boolean(error);
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="M’ma Organic Farm home"
        >
          <Image src="/mma-logo.png" alt="" width={62} height={52} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <Link href={user ? "/account" : "/shop"}>
          {user ? "My account" : "Explore the farm"}
        </Link>
      </header>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}>A little welcome back</span>
          <h1>
            Fresh mornings,
            <br />
            again.
          </h1>
          <p>
            Come back to the milk you love. Make a new monthly plan around your
            mornings, with fresh milk, paneer and ghee on the dates you choose.
          </p>
          <div className={styles.offer}>
            <span className={styles.percent}>
              5% <small>off</small>
            </span>
            <div>
              <h2>Your first month back</h2>
              <p>On your products, with your personal code at checkout.</p>
            </div>
          </div>
          {!user ? (
            <>
              <Link
                className={styles.primary}
                href="/sign-in?next=%2Fwelcome-back"
              >
                Sign in to see my code <span aria-hidden="true">↗</span>
              </Link>
              <p className={styles.hint}>
                Use the same account as your cancelled plan.
              </p>
            </>
          ) : unavailable ? (
            <p role="status">
              We couldn&apos;t load your offer. Please try again shortly.
            </p>
          ) : offer?.state === "redeemed" ? (
            <>
              <p className={styles.notice}>
                You&apos;ve already used your welcome-back offer. Your fresh
                mornings can still continue.
              </p>
              <Link className={styles.primary} href="/shop">
                Plan my deliveries <span aria-hidden="true">↗</span>
              </Link>
            </>
          ) : offer ? (
            <>
              <PersonalOfferCode code={offer.code} />
              <Link
                className={styles.primary}
                href={
                  offer.state === "reserved" && offer.order_id
                    ? `/checkout/review?order=${offer.order_id}`
                    : "/shop"
                }
              >
                {offer.state === "reserved"
                  ? "Continue my checkout"
                  : "Build my monthly plan"}{" "}
                <span aria-hidden="true">↗</span>
              </Link>
              <p className={styles.hint}>
                {offer.state === "reserved"
                  ? "Your code is attached to this checkout. You can remove it before payment starts."
                  : "Copy your code, choose your dates, then apply it when reviewing checkout."}
              </p>
            </>
          ) : (
            <>
              <p className={styles.notice}>
                This offer is for customers returning after cancelling a paid
                plan, before purchasing their first month back.
              </p>
              <Link className={styles.primary} href="/shop">
                Explore monthly plans <span aria-hidden="true">↗</span>
              </Link>
            </>
          )}
          <p className={styles.terms}>
            One offer per customer. Valid on a new prepaid calendar-month plan
            after a paid-plan cancellation. Bottle charges and delivery are
            excluded. Other offers cannot be combined. No cash refund.
          </p>
        </div>
        <div className={styles.picture}>
          <Image
            src="/offers/welcome-back-v1.png"
            alt="M’ma milk on a sunlit breakfast table. Fresh mornings, again. 5% off your first month back."
            width={1254}
            height={1254}
            priority
            sizes="(max-width: 760px) 100vw, 50vw"
          />
        </div>
      </section>
    </main>
  );
}
