"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({
  children,
  className,
  name,
  pendingLabel = "Saving…",
  value,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  pendingLabel?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-disabled={pending}
      className={className}
      disabled={pending}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
