"use client";
import Link from "next/link";
export default function CalendarError({ reset }: { reset: () => void }) {
  return <main style={{ padding: "4rem 1.5rem", maxWidth: "44rem", margin: "auto" }}>
    <h1>Your delivery calendar is temporarily unavailable.</h1>
    <p role="alert">We could not load the latest delivery dates. Please try again or contact the farm. Your paid plan has not been changed.</p>
    <button type="button" onClick={reset}>Try again</button>
    <p><Link href="/account">Back to your profile</Link></p>
  </main>;
}
