"use client";

import Link from "next/link";
import { useId, useState } from "react";
import styles from "./referral-badge.module.css";

export function ReferralBadge() {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <aside className={styles.badge} aria-label="Referral program">
      <Link className={styles.link} href="/account/referrals" prefetch={false} aria-label="Refer & Earn">
        <svg className={styles.seal} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={`${id}-pine`} x1="0" x2="1" y1="0" y2="1" gradientUnits="objectBoundingBox">
              <stop stopColor="#3a5b4e" />
              <stop offset="1" stopColor="#172d25" />
            </linearGradient>
            <linearGradient id={`${id}-paper`} x1="0" x2="0" y1="0" y2="1">
              <stop stopColor="#fffaf0" />
              <stop offset="1" stopColor="#ebddbb" />
            </linearGradient>
            <path id={`${id}-arc`} d="M19 60a41 41 0 0 1 82 0" />
          </defs>
          <g className={styles.bezel} data-referral-bezel>
            <path
              d="M60.0 3.5
                 C63.9 3.5 67.6 8.0 71.7 8.9
                 C75.7 9.8 81.0 7.4 84.5 9.1
                 C88.0 10.8 89.4 16.4 92.7 19.0
                 C95.9 21.6 101.8 21.7 104.2 24.8
                 C106.6 27.8 105.4 33.5 107.2 37.3
                 C109.0 41.0 114.2 43.6 115.1 47.4
                 C115.9 51.2 112.4 55.8 112.4 60.0
                 C112.4 64.2 115.9 68.8 115.1 72.6
                 C114.2 76.4 109.0 79.0 107.2 82.7
                 C105.4 86.5 106.6 92.2 104.2 95.2
                 C101.8 98.3 95.9 98.4 92.7 101.0
                 C89.4 103.6 88.0 109.2 84.5 110.9
                 C81.0 112.6 75.7 110.2 71.7 111.1
                 C67.6 112.0 63.9 116.5 60.0 116.5
                 C56.1 116.5 52.4 112.0 48.3 111.1
                 C44.3 110.2 39.0 112.6 35.5 110.9
                 C32.0 109.2 30.6 103.6 27.3 101.0
                 C24.1 98.4 18.2 98.3 15.8 95.2
                 C13.4 92.2 14.6 86.5 12.8 82.7
                 C11.0 79.0 5.8 76.4 4.9 72.6
                 C4.1 68.8 7.6 64.2 7.6 60.0
                 C7.6 55.8 4.1 51.2 4.9 47.4
                 C5.8 43.6 11.0 41.0 12.8 37.3
                 C14.6 33.5 13.4 27.8 15.8 24.8
                 C18.2 21.7 24.1 21.6 27.3 19.0
                 C30.6 16.4 32.0 10.8 35.5 9.1
                 C39.0 7.4 44.3 9.8 48.3 8.9
                 C52.4 8.0 56.1 3.5 60.0 3.5Z"
              fill={`url(#${id}-pine)`} stroke="#12281e" strokeWidth="1.7"
            />
            <path d="M25 31a45 45 0 0 1 37-16m31 76a45 45 0 0 1-24 13" fill="none"
              stroke="#fae9ab" strokeWidth="1.25" strokeLinecap="round" strokeOpacity=".55" />
          </g>
          <circle cx="60" cy="60" r="48.6" fill="none" stroke="#e3c773" strokeOpacity=".64" strokeWidth=".75" />
          <text className={styles.lettering} fill="#fae9ab">
            <textPath href={`#${id}-arc`} startOffset="50%" textAnchor="middle">REFER &amp; EARN</textPath>
          </text>

          <path d="M27 58v10m-5-5h10m64-11v9m-4.5-4.5h9" stroke="#f5c84b" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx="91" cy="45" r="1.3" fill="#f5c84b" />
          <circle cx="29" cy="75" r="1.05" fill="#f5c84b" />
          <g className={styles.envelope}>
            <g transform="rotate(13 61 62)">
              <rect x="44" y="39" width="36" height="34" rx="3" fill="#dcc683" stroke="#223c31" strokeWidth="1.2" />
              <path d="M52 47h20m-20 5h15" stroke="#695b39" strokeWidth="1.2" strokeLinecap="round" />
            </g>
            <g transform="rotate(-10 59 68)">
              <rect x="34" y="56" width="54" height="34" rx="4" fill="#142b20" fillOpacity=".45" />
              <rect x="32" y="53" width="54" height="34" rx="4" fill={`url(#${id}-paper)`} stroke="#223c31" strokeWidth="1.2" />
              <path d="m34 83 15-13m35 13L69 70" stroke="#ad9564" fill="none" strokeWidth="1" />
              <path d="m33 55 22 17a6 6 0 0 0 8 0l22-17" stroke="#ad9564" fill="none" strokeWidth="1" />
              <circle cx="59" cy="72" r="9.4" fill="#f5c84b" stroke="#b9942e" strokeWidth=".9" />
              <path d="M57.5 67h3v2l1.4 2v5.5h-5.8V71l1.4-2zm-1.4 5.4h5.8" fill="none" stroke="#29473c" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </g>
          <path d="M52 98h3m10 0h3m-8-2v4" stroke="#e3c773" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      </Link>
      <button type="button" className={styles.dismiss} aria-label="Dismiss Refer and Earn" onClick={() => setDismissed(true)}>
        <span aria-hidden="true">×</span>
      </button>
    </aside>
  );
}
