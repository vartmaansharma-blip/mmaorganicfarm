export type MilkIntake = {
  id: string;
  intake_date: string;
  received_at: string;
  source: string;
  reference: string;
  received_litres: number;
  accepted_litres: number;
  rejected_litres: number;
  rejection_reason: string;
  handling: "chilled" | "awaiting_chilling" | "segregated";
  storage_location: string;
  quality_notes: string;
  status: "recorded" | "voided";
  version: number;
  recorded_by_name: string;
  recorded_at: string;
  updated_at: string;
};
export type MilkIntakeWorkspace = {
  date: string;
  page: number;
  total: number;
  summary: {
    received: number;
    accepted: number;
    rejected: number;
    recorded: number;
    voided: number;
  };
  records: MilkIntake[];
};
export type IntakeHistory = {
  version: number;
  action: string;
  reason: string;
  actor: string;
  created_at: string;
  before_state: MilkIntake | null;
  after_state: MilkIntake;
};
export function intakeLitres(value: number | string) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
    Number(value),
  );
}
export function intakeClock(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
export const intakeHandling = {
  chilled: "Chilled",
  awaiting_chilling: "Awaiting chilling",
  segregated: "Kept separately",
};
