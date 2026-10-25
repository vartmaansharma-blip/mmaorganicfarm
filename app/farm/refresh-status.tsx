"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
export function RefreshStatus({ updatedAt }: { updatedAt: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !document.activeElement?.closest("form") &&
        !pending
      )
        startTransition(() => router.refresh());
    }, 30_000);
    return () => clearInterval(timer);
  }, [router, pending]);
  return (
    <div aria-live="polite">
      <span>
        Updated{" "}
        {new Date(Date.parse(updatedAt) + 330 * 60_000)
          .toISOString()
          .slice(11, 16)}{" "}
        IST · refreshes every 30s
      </span>{" "}
      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        disabled={pending}
      >
        {pending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
