"use client";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./farm-shell.module.css";
export function PullToRefresh({
  surface,
}: {
  surface: RefObject<HTMLDivElement | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [distance, setDistance] = useState(0);
  const [notice, setNotice] = useState("");
  const activeRequest = useRef(false);
  const wasPending = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setNotice("");
      setDistance(0);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  useEffect(() => {
    if (pending) wasPending.current = true;
    if (!pending && wasPending.current) {
      wasPending.current = false;
      activeRequest.current = false;
      const frame = requestAnimationFrame(() => setNotice("Page updated"));
      return () => cancelAnimationFrame(frame);
    }
  }, [pending]);
  useEffect(() => {
    if (!notice || pending || distance > 0) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice, pending, distance]);
  useEffect(() => {
    const root = surface.current;
    if (!root) return;
    let start: { x: number; y: number; pull: number } | null = null;
    const touchStart = (event: TouchEvent) => {
      if (
        event.touches.length !== 1 ||
        window.scrollY > 1 ||
        activeRequest.current
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "input,select,textarea,button,a,summary,[contenteditable]",
        )
      )
        return;
      start = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        pull: 0,
      };
    };
    const touchMove = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const dy = event.touches[0].clientY - start.y;
      const dx = Math.abs(event.touches[0].clientX - start.x);
      if (dy < 0 || dx > Math.abs(dy)) {
        start = null;
        setDistance(0);
        return;
      }
      if (dy > 6) {
        if (event.cancelable) event.preventDefault();
        start.pull = Math.min(110, dy * 0.6);
        setDistance(start.pull);
        setNotice("");
      }
    };
    const touchEnd = () => {
      const pull = start?.pull ?? 0;
      start = null;
      setDistance(0);
      if (pull < 64 || activeRequest.current) return;
      if (root.querySelector('form[data-farm-pending="true"]')) {
        setNotice("Please wait for the save to finish");
        return;
      }
      if (root.querySelector('form[data-farm-dirty="true"]')) {
        setNotice("Save your unfinished edit before refreshing");
        return;
      }
      if (!navigator.onLine) {
        setNotice("You’re offline. Current records are still here.");
        return;
      }
      activeRequest.current = true;
      setNotice("Updating this page…");
      startTransition(() => router.refresh());
    };
    const touchCancel = () => {
      start = null;
      setDistance(0);
    };
    root.addEventListener("touchstart", touchStart, { passive: true });
    root.addEventListener("touchmove", touchMove, { passive: false });
    root.addEventListener("touchend", touchEnd);
    root.addEventListener("touchcancel", touchCancel);
    return () => {
      root.removeEventListener("touchstart", touchStart);
      root.removeEventListener("touchmove", touchMove);
      root.removeEventListener("touchend", touchEnd);
      root.removeEventListener("touchcancel", touchCancel);
    };
  }, [surface, router]);
  return (
    <div
      className={styles.pullStatus}
      data-visible={distance > 0 || Boolean(notice) || undefined}
      data-refreshing={pending || undefined}
      role="status"
      aria-live="polite"
    >
      {distance > 0
        ? distance >= 64
          ? "Release to update this page"
          : "Pull to update"
        : notice}
    </div>
  );
}
