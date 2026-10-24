import type { FarmReview } from "@/lib/landing-content";
import styles from "../landing.module.css";

export function FarmReviews({ reviews }: { reviews: FarmReview[] }) {
  const approved = reviews.filter(review => review.consentToPublish && review.name.trim() && review.quote.trim());
  if (!approved.length) return null;
  return <section className={styles.section} aria-labelledby="reviews-title"><p className={styles.eyebrow}>From our customers</p><h2 id="reviews-title">In their own words.</h2><div className={styles.reviewGrid}>{approved.map((review, index) => <figure key={`${review.name}-${index}`}><blockquote>{review.quote}</blockquote><figcaption>{review.name}</figcaption></figure>)}</div></section>;
}
