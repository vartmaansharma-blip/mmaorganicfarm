import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "./actions";
import styles from "./sign-in.module.css";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to M'ma Organic Farm to prepare for milk ordering and delivery updates.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SignInPageProps = {
  searchParams: Promise<{
    mode?: string;
    error?: string;
    message?: string;
    next?: string;
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const isSignUp = params.mode === "sign-up";
  const next = params.next?.startsWith("/") ? params.next : "/";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next);
  }

  return (
    <main className={styles.page}>
      <section className={styles.farmPanel} aria-label="M'ma Organic Farm">
        <Image
          src="/farm-bottle.png"
          alt="M'ma Organic Farm milk bottle at the farm"
          fill
          priority
          sizes="(max-width: 820px) 100vw, 52vw"
        />
        <div className={styles.farmShade} />
        <Link className={styles.brand} href="/">
          <Image src="/mma-logo.png" alt="" width={88} height={76} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <div className={styles.farmCopy}>
          <p>Fresh milk · Jamshedpur</p>
          <h1>Your morning milk, now easier to manage.</h1>
          <div className={styles.promiseRow}>
            <span>Order history</span>
            <span>Delivery status</span>
            <span>Faster checkout</span>
          </div>
        </div>
      </section>

      <section className={styles.authPanel}>
        <Link className={styles.backLink} href="/">
          ← Back to the farm
        </Link>

        <div className={styles.authContent}>
          <p className={styles.eyebrow}>Customer account</p>
          <h2>{isSignUp ? "Create your account" : "Welcome back"}</h2>
          <p className={styles.intro}>
            {isSignUp
              ? "Start with your identity. Delivery details come later, only when you order."
              : "Sign in to continue your milk order and, later, view delivery updates."}
          </p>

          {params.error ? (
            <p className={styles.error} role="alert">
              {params.error}
            </p>
          ) : null}
          {params.message ? (
            <p className={styles.message} role="status">
              {params.message}
            </p>
          ) : null}

          <form action={signInWithGoogle}>
            <input name="next" type="hidden" value={next} />
            <button className={styles.googleButton} type="submit">
              <Image
                src="/google-g.svg"
                alt=""
                aria-hidden="true"
                width={22}
                height={22}
              />
              Continue with Google
            </button>
          </form>

          <div className={styles.divider}>
            <span>or use email</span>
          </div>

          <form
            action={isSignUp ? signUpWithEmail : signInWithEmail}
            className={styles.emailForm}
          >
            <input name="next" type="hidden" value={next} />
            {isSignUp ? (
              <label>
                Full name
                <input
                  autoComplete="name"
                  name="fullName"
                  placeholder="Your name"
                  required
                  type="text"
                />
              </label>
            ) : null}
            <label>
              Email address
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                placeholder="you@example.com"
                required
                type="email"
              />
            </label>
            <label>
              Password
              <input
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={8}
                name="password"
                placeholder={isSignUp ? "At least 8 characters" : "Your password"}
                required
                type="password"
              />
            </label>
            {!isSignUp ? (
              <Link className={styles.forgotLink} href="/forgot-password">
                Forgot your password?
              </Link>
            ) : null}
            <button className={styles.submitButton} type="submit">
              {isSignUp ? "Create account" : "Sign in"}
              <span>→</span>
            </button>
          </form>

          <p className={styles.switchMode}>
            {isSignUp ? "Already have an account?" : "New to M'ma Organic Farm?"}{" "}
            <Link
              href={
                isSignUp
                  ? `/sign-in?next=${encodeURIComponent(next)}`
                  : `/sign-in?mode=sign-up&next=${encodeURIComponent(next)}`
              }
            >
              {isSignUp ? "Sign in" : "Create an account"}
            </Link>
          </p>

          <p className={styles.privacyNote}>
            We use your account only for ordering, payment receipts, delivery
            updates, and customer support.
          </p>
        </div>
      </section>
    </main>
  );
}
