type DatabaseError = { code?: string; message?: string };
export function databaseErrorMessage(error: DatabaseError | null, fallback: string) {
  if (["PGRST200", "PGRST202", "PGRST204", "42703", "42883"].includes(error?.code ?? ""))
    return "The delivery calendar is temporarily unavailable while the farm updates it. Your selection is saved in this browser. Please try again shortly or contact the farm.";
  return fallback;
}
