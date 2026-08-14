"use client";

import styles from "./sheet.module.css";

export function PrintSheetButton() {
  return (
    <button
      className={styles.printButton}
      onClick={() => window.print()}
      type="button"
    >
      Print or save PDF
    </button>
  );
}
