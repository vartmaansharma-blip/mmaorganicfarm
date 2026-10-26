"use client";

import { useFormStatus } from "react-dom";
import styles from "./farm-shell.module.css";

export function FormSubmitButton({
  children,
  className,
  name,
  pendingLabel = "Saving…",
  value,
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  pendingLabel?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending || disabled}
      aria-busy={pending}
      data-pending={pending || undefined}
      className={className}
      disabled={pending || disabled}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? (
        <span className={styles.buttonSpinner} aria-hidden="true" />
      ) : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
