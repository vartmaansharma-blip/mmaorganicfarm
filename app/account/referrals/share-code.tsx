"use client";

import { useState } from "react";
import styles from "./referrals.module.css";

export function ShareCode({ code, inviteUrl, firstMonthDiscount }: { code: string; inviteUrl: string; firstMonthDiscount?: string }) {
  const [status, setStatus] = useState("");
  const message = `Try the monthly scheduled plan from M’ma Organic Farm. Link my referral before your first checkout.${firstMonthDiscount ? ` Get up to ${firstMonthDiscount} off your first scheduled month while the offer is active.` : ""} My reward unlocks after your first paid delivery is completed.\n\n${inviteUrl}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const email = `mailto:?subject=${encodeURIComponent("An invite to M’ma Organic Farm")}&body=${encodeURIComponent(message.replaceAll("\n", "\r\n"))}`;

  return (
    <div className={styles.share}>
      <code aria-label="Your referral code">{code}</code>
      <div className={styles.shareActions}>
        <a className={styles.whatsapp} href={whatsapp} target="_blank" rel="noopener noreferrer">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20.6 11.8a8.6 8.6 0 0 1-12.8 7.5l-4.4 1.2 1.2-4.3a8.6 8.6 0 1 1 16-4.4Z" />
            <path d="m8.4 8.2 1-.8 1.5 2.2-.9.9c.5 1.2 1.4 2.1 2.7 2.7l.9-.9 2.2 1.5-.8 1c-.6.7-1.9.9-3.8-.3a9.5 9.5 0 0 1-2.7-2.7c-1.1-1.8-.8-3.1-.1-3.6Z" />
          </svg>
          Share on WhatsApp
        </a>
        <a className={styles.secondary} href={email}>Email</a>
        <button type="button" className={styles.secondary} onClick={async () => {
          try {
            await navigator.clipboard.writeText(inviteUrl);
            setStatus("Link copied.");
          } catch {
            setStatus("Copy the code above to share it.");
          }
        }}>Copy link</button>
      </div>
      {status ? <small role="status">{status}</small> : null}
    </div>
  );
}
