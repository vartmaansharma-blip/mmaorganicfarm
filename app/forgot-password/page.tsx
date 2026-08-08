import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requestPasswordReset } from "./actions";
import styles from "../sign-in/sign-in.module.css";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false, follow: false },
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const params = await searchParams;

  return (
    <main className={styles.recoveryPage}>
      <section className={styles.recoveryContent}>
        <Link className={styles.recoveryBrand} href="/">
          <Image src="/mma-logo.png" alt="" width={64} height={54} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <p className={styles.eyebrow}>Customer account</p>
        <h1>Reset your password.</h1>
        <p className={styles.recoveryIntro}>
          Enter the email used for your account. We will send one secure link
          to choose a new password.
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
        <form action={requestPasswordReset} className={styles.emailForm}>
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
          <button className={styles.submitButton} type="submit">
            Send reset link <span>→</span>
          </button>
        </form>
        <Link className={styles.recoveryBack} href="/sign-in">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
