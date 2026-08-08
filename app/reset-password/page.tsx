import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { updatePassword } from "./actions";
import styles from "../sign-in/sign-in.module.css";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <main className={styles.recoveryPage}>
      <section className={styles.recoveryContent}>
        <Link className={styles.recoveryBrand} href="/">
          <Image src="/mma-logo.png" alt="" width={64} height={54} />
          <span>M&apos;ma Organic Farm</span>
        </Link>
        <p className={styles.eyebrow}>Customer account</p>
        <h1>Choose a new password.</h1>
        <p className={styles.recoveryIntro}>
          Use at least eight characters. Your new password will replace the old
          one immediately.
        </p>
        {params.error ? (
          <p className={styles.error} role="alert">
            {params.error}
          </p>
        ) : null}
        <form action={updatePassword} className={styles.emailForm}>
          <label>
            New password
            <input
              autoComplete="new-password"
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type="password"
            />
          </label>
          <label>
            Confirm new password
            <input
              autoComplete="new-password"
              minLength={8}
              name="confirmation"
              placeholder="Repeat your password"
              required
              type="password"
            />
          </label>
          <button className={styles.submitButton} type="submit">
            Update password <span>→</span>
          </button>
        </form>
      </section>
    </main>
  );
}
