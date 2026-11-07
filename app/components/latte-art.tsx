import Image from "next/image";
import styles from "./rising-glass-hero.module.css";

/** One shared 1317×1194 canvas. Only the artwork is masked; the milk is untouched. */
export function LatteArt({ id }: { id: string }) {
  const area = `${id}-art-area`, mask = `${id}-formation`;
  return (
    <div className={styles.top} data-overhead-composition>
      <Image data-overhead-photo src="/hero/milk-overhead-fixed.webp" alt="" width={1317} height={1194} loading="eager" unoptimized sizes="(max-width: 720px) 260px, 38vw" />
      <svg className={styles.latte} viewBox="0 0 1317 1194" aria-hidden="true" focusable="false" data-latte-art>
        <defs>
          {/* Keep all artwork well inside the original bubbles and glass rim. */}
          <clipPath id={area}><ellipse cx="650" cy="602" rx="408" ry="408" /></clipPath>
          <filter id={`${id}-feather`} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation="10" /></filter>
          <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="1254" height="1254" style={{ maskType: "luminance" }}>
            <g filter={`url(#${id}-feather)`} fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
              {/* A narrow crema stream grows into the perimeter before the foam letters. */}
              <path d="M 585 850 Q 430 850 320 720 Q 195 540 260 365 Q 330 225 475 340" pathLength="1" strokeWidth="95" className={styles.cremaStroke} />
              <path d="M 585 1000 C 470 850 160 745 170 465 C 145 230 425 180 575 370 C 730 160 1080 220 1020 540 C 1030 780 770 830 585 1000 Z" pathLength="1" strokeWidth="145" className={styles.heartStroke} />
              <path d="M 110 480 C 300 400 720 575 1040 470" pathLength="1" strokeWidth="390" className={styles.nameStroke} />
              <path d="M 295 730 L 850 730" pathLength="1" strokeWidth="280" className={styles.farmsStroke} />
              <path d="M 835 755 Q 970 705 1060 795 Q 1170 860 1240 790" pathLength="1" strokeWidth="390" className={styles.smallHeartStroke} />
              {/* Complete the remaining tiny texture gaps spatially, without fading. */}
              <path d="M 630 1310 L 630 -60" pathLength="1" strokeWidth="1400" className={styles.settleStroke} />
            </g>
          </mask>
        </defs>
        <g clipPath={`url(#${area})`}>
          <g transform="translate(215 145) scale(.70)">
            <image href="/hero/latte-heart-approved.webp" width="1254" height="1254" mask={`url(#${mask})`} />
          </g>
        </g>
      </svg>
      {/* Decode the exact overlay too before the existing film can enter overhead. */}
      <Image className={styles.assetPreload} src="/hero/latte-heart-approved.webp" alt="" width={1254} height={1254} loading="eager" unoptimized />
    </div>
  );
}
