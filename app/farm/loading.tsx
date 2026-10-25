import styles from "./operations-workbench.module.css";
export default function Loading() {
  return (
    <main className={styles.page} aria-busy="true">
      <p className={styles.hint} role="status">
        Loading farm records…
      </p>
      <h1>Farm operations</h1>
      <p>
        Checking your current workspace. Counts appear after records have
        loaded.
      </p>
    </main>
  );
}
