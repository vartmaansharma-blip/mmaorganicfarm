"use client";

import { useFormStatus } from "react-dom";

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
      className={className}
      disabled={pending || disabled}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
