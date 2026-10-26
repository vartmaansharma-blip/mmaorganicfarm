"use client";

import {
  useActionState,
  useLayoutEffect,
  useRef,
  type ComponentProps,
} from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { performFarmAction } from "./farm-action-feedback";
import styles from "./farm-shell.module.css";
import { announceFarmSave } from "./farm-save-notice";

type Feedback = { ok: boolean; message?: string; error?: string };
type Props = ComponentProps<"form"> & {
  managed?: boolean;
  feedback?: Feedback | null;
};

function FormPhase({
  form,
}: {
  form: React.RefObject<HTMLFormElement | null>;
}) {
  const { pending } = useFormStatus();
  useLayoutEffect(() => {
    form.current?.setAttribute("data-farm-pending", String(pending));
    form.current?.setAttribute("aria-busy", String(pending));
  }, [pending, form]);
  return null;
}

export function FarmForm({
  action,
  managed = false,
  feedback,
  children,
  onSubmit,
  onInput,
  onChange,
  onReset,
  ...props
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const position = useRef<{ top: number; scroll: number } | null>(null);
  const [result, submit] = useActionState(
    async (_: unknown, data: FormData) => {
      if (typeof action !== "function") return null;
      return performFarmAction(action, pathname, data);
    },
    null,
  );
  const currentFeedback = managed ? feedback : result;

  useLayoutEffect(() => {
    if (!currentFeedback || !form.current) return;
    if (currentFeedback.ok) {
      delete form.current.dataset.farmDirty;
      announceFarmSave(
        currentFeedback.message ?? "Saved. Your records are up to date.",
      );
    }
    const saved = position.current;
    if (!saved) return;
    const frame = requestAnimationFrame(() => {
      const target = form.current;
      if (!target) return;
      // Preserve the section's viewport position without undoing deliberate
      // scrolling by someone who continued reading while the request ran.
      if (
        window.scrollY === 0 ||
        Math.abs(window.scrollY - saved.scroll) < 96
      ) {
        const delta = target.getBoundingClientRect().top - saved.top;
        if (Math.abs(delta) > 1)
          window.scrollBy({ top: delta, behavior: "instant" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [currentFeedback]);

  return (
    <form
      {...props}
      ref={form}
      action={managed || typeof action !== "function" ? action : submit}
      onInput={(event) => {
        event.currentTarget.dataset.farmDirty = "true";
        onInput?.(event);
      }}
      onChange={(event) => {
        event.currentTarget.dataset.farmDirty = "true";
        onChange?.(event);
      }}
      onReset={(event) => {
        event.preventDefault();
        onReset?.(event);
      }}
      onSubmit={(event) => {
        if (event.currentTarget.dataset.farmPending === "true") {
          event.preventDefault();
          return;
        }
        position.current = {
          top: event.currentTarget.getBoundingClientRect().top,
          scroll: window.scrollY,
        };
        onSubmit?.(event);
        if (!action && (props.method ?? "get").toLowerCase() === "get") {
          delete event.currentTarget.dataset.farmDirty;
          if (event.defaultPrevented) return;
          event.preventDefault();
          const query = new URLSearchParams();
          for (const [key, value] of new FormData(event.currentTarget))
            if (String(value).trim()) query.append(key, String(value));
          router.push(`${pathname}${query.size ? `?${query}` : ""}`, {
            scroll: false,
          });
        }
      }}
    >
      {children}
      <FormPhase form={form} />
      {!managed && result ? (
        <p
          className={styles.formFeedback}
          data-error={!result.ok || undefined}
          role={result.ok ? "status" : "alert"}
        >
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
