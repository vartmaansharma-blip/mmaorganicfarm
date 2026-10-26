import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import styles from "./welcome-back.module.css";

const title = "M’ma awaits you.";
const description =
  "Come back to fresh milk, paneer and ghee. Plan your next delivery with M’ma Organic Farm.";
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/welcome-back" },
  openGraph: {
    title,
    description,
    url: "/welcome-back",
    images: [
      {
        url: "/offers/welcome-back-v3.png",
        width: 1254,
        height: 1254,
        alt: "M’ma awaits you. Milk, paneer and ghee against a cinematic black backdrop.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/offers/welcome-back-v3.png"],
  },
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

export default async function WelcomeBackPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
          <span className={styles.eyebrow}>Your fresh start</span>
          <h1>
            M&apos;ma
            <br />
            awaits you.
          </h1>
          <p>
            The mornings you loved are waiting. Fresh milk, soft paneer and
            golden ghee, brought back into your everyday.
          </p>
          <div className={styles.invitation}>
            <span aria-hidden="true">↗</span>
            <div>
              <h2>Come back to fresh.</h2>
              <p>
                Choose the products and delivery dates that feel right for you.
              </p>
            </div>
          </div>
          <Link className={styles.primary} href="/shop">
            Plan my fresh start <span aria-hidden="true">↗</span>
          </Link>
          <p className={styles.hint}>
            Browse freely. Sign in with your existing account when you&apos;re
            ready to checkout.
          </p>
          <p className={styles.terms}>
            Need help changing your next delivery?{" "}
            <a href="https://wa.me/919818804419?text=Hello%20M%27ma%20Organic%20Farm%2C%20I%27d%20like%20help%20rejoining%20or%20rescheduling%20my%20deliveries.">
              Talk to the farm on WhatsApp.
            </a>
          </p>
        </div>
        <div className={styles.picture}>
          <Image
            src="/offers/welcome-back-v3.png"
            alt="M’ma milk centred between paneer and ghee, with mist on a black backdrop. M’ma awaits you. Come back to fresh."
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
