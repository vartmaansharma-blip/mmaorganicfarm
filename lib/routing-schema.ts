// Only a known missing additive column permits the address-only compatibility
// query. Permission, network and unrelated schema errors must remain visible.
export function isMissingDestinationSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return ["42703", "PGRST204"].includes(String(value.code)) &&
    /destination_(latitude|longitude|confirmed_at)/.test(String(value.message));
}
