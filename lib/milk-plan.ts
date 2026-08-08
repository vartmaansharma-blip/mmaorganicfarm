export const MILK_PLAN_DAYS = [
  { short: "Mon", label: "Monday" },
  { short: "Tue", label: "Tuesday" },
  { short: "Wed", label: "Wednesday" },
  { short: "Thu", label: "Thursday" },
  { short: "Fri", label: "Friday" },
  { short: "Sat", label: "Saturday" },
  { short: "Sun", label: "Sunday" },
] as const;

const MAX_DAILY_LITRES = 5;
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export type WeeklyMilkSchedule = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export function serializeWeeklyMilkSchedule(schedule: WeeklyMilkSchedule) {
  return schedule.join(",");
}

export function parseWeeklyMilkSchedule(value: string) {
  const quantities = value.split(",").map(Number);
  const isValid =
    quantities.length === MILK_PLAN_DAYS.length &&
    quantities.every(
      (quantity) =>
        Number.isInteger(quantity) &&
        quantity >= 0 &&
        quantity <= MAX_DAILY_LITRES,
    );

  return isValid ? (quantities as WeeklyMilkSchedule) : null;
}

export function normalizePlanStartDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00`);
  const isExactDate =
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return isExactDate ? value : "";
}

export function formatPlanStartDate(value: string) {
  const normalized = normalizePlanStartDate(value);
  return normalized
    ? dateFormatter.format(new Date(`${normalized}T00:00:00`))
    : "Choose date";
}

export function describeWeeklyMilkSchedule(schedule: WeeklyMilkSchedule) {
  return MILK_PLAN_DAYS.map(
    (day, index) => `${day.short} ${schedule[index]} L`,
  ).join(" · ");
}
