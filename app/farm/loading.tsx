import styles from "./farm-shell.module.css";
export default function Loading() {
  return (
    <main className={styles.loadingPage} aria-busy="true">
      <header>
        <p className={styles.loadingEyebrow}>M’ma farm workspace</p>
        <h1>Getting your day ready.</h1>
        <p role="status">Loading the latest farm records…</p>
      </header>
      <div className={styles.loadingGrid} aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div key={item} className={styles.loadingCard}>
            <span />
            <b />
            <span />
          </div>
        ))}
      </div>
      <div className={styles.loadingRows} aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <div key={item}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </main>
  );
}
