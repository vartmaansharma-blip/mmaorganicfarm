import styles from "./progress-visual.module.css";

/** An additional visual of recorded values; never treats an empty day as complete. */
export function SemiRing({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label: string;
}) {
  const percent =
    total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0;
  return (
    <div
      className={styles.ring}
      role="img"
      aria-label={`${value} of ${total} ${label}`}
    >
      <svg viewBox="0 0 240 140" aria-hidden="true">
        <path
          className={styles.track}
          d="M20 120 A100 100 0 0 1 220 120"
          pathLength="100"
        />
        <path
          className={styles.fill}
          d="M20 120 A100 100 0 0 1 220 120"
          pathLength="100"
          strokeDasharray={`${percent} 100`}
        />
      </svg>
      <div className={styles.value}>
        <strong>
          {value}
          <small> / {total}</small>
        </strong>
      </div>
    </div>
  );
}
