// Keep checkout choices on this site after email and OAuth sign-in.
export function safeAuthReturn(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return "/";
  const base = "https://mma.invalid";
  try {
    return new URL(value, base).origin === base ? value : "/";
  } catch {
    return "/";
  }
}
