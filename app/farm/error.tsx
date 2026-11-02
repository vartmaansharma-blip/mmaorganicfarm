"use client";
import styles from "./operations-workbench.module.css";

export default function FarmError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <p className={styles.hint}>Farm operations</p>
        <h1>This operation could not be loaded</h1>
        <p className={styles.hint}>
          Your data was not intentionally changed. Try the page again; if the
          problem continues, return to the dashboard and repeat the action.
        </p>
        <div className={styles.links}>
          <button onClick={reset} type="button">
            Try again
          </button>
          <a href="/farm">Farm dashboard</a>
        </div>
      </section>
    </main>
  );
}
