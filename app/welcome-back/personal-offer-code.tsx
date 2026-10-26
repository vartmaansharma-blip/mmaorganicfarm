"use client";
import { useState } from "react";
import styles from "./welcome-back.module.css";

export function PersonalOfferCode({ code }: { code: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Code copied. Apply it at checkout.");
    } catch {
      setMessage("Select and copy your code above, then paste it at checkout.");
    }
  }
  return (
    <div className={styles.codeBox}>
      <label htmlFor="personal-offer-code">Your personal, one-use code</label>
      <div>
        <input
          id="personal-offer-code"
          value={code}
          readOnly
          onFocus={(e) => e.target.select()}
        />
        <button onClick={copy} type="button">
          Copy code
        </button>
      </div>
      <p role="status" aria-live="polite">
        {message || "This code belongs to your account."}
      </p>
    </div>
  );
}
