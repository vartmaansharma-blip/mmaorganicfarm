import { FARM_PRODUCTS } from "@/lib/farm-products";

export type CalendarDeliveryItem = {
  productKey: string;
  quantity: number;
  unit: string;
};

export type CalendarDay = {
  date: string;
  dayLabel: string;
  items: CalendarDeliveryItem[];
  paused: boolean;
  skippedProductKeys: string[];
};

export type DeliveryException = {
  action: "override" | "skip";
  delivery_date: string;
  product_key: string;
  quantity: number | null;
  unit: string | null;
};

export type DeliveryPause = {
  end_date: string;
  id?: string;
  start_date: string;
};

export type ScheduledDeliveryItem = {
  delivery_date: string;
  product_key: string;
  quantity: number;
  unit: string;
};

export type WeeklyDeliveryItem = {
  day_of_week: number;
  product_key: string;
  quantity: number;
  unit: string;
};

const dateLabelFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  weekday: "short",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
});

export function dateFromYmd(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatYmd(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(value: string, days: number) {
  const date = dateFromYmd(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

export function todayInIndia() {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatCalendarDate(value: string) {
  return fullDateFormatter.format(dateFromYmd(value));
}

export function productName(productKey: string) {
  if (productKey === "milk") return "Fresh milk";
  return (
    FARM_PRODUCTS.find((product) => product.id === productKey)?.name ??
    productKey
  );
}

export function weekdayFromYmd(value: string) {
  const day = dateFromYmd(value).getUTCDay();
  return day === 0 ? 7 : day;
}

function isPaused(value: string, pauses: DeliveryPause[]) {
  return pauses.some(
    (pause) => value >= pause.start_date && value <= pause.end_date,
  );
}

// Resolve the normal weekly routine, one-time items, date changes, and pauses.
export function buildDeliveryCalendar({
  days = 21,
  exceptions,
  pauses,
  scheduledItems,
  startDate,
  weeklyItems,
}: {
  days?: number;
  exceptions: DeliveryException[];
  pauses: DeliveryPause[];
  scheduledItems: ScheduledDeliveryItem[];
  startDate: string;
  weeklyItems: WeeklyDeliveryItem[];
}) {
  const firstDate = startDate > todayInIndia() ? startDate : todayInIndia();

  return Array.from({ length: days }, (_, index): CalendarDay => {
    const date = addCalendarDays(firstDate, index);
    const paused = isPaused(date, pauses);
    const baseItems = [
      ...weeklyItems
        .filter((item) => item.day_of_week === weekdayFromYmd(date))
        .map((item) => ({
          productKey: item.product_key,
          quantity: Number(item.quantity),
          unit: item.unit,
        })),
      ...scheduledItems
        .filter((item) => item.delivery_date === date)
        .map((item) => ({
          productKey: item.product_key,
          quantity: Number(item.quantity),
          unit: item.unit,
        })),
    ];
    const itemMap = new Map(
      baseItems.map((item) => [item.productKey, item]),
    );
    const skippedProductKeys: string[] = [];

    exceptions
      .filter((item) => item.delivery_date === date)
      .forEach((exception) => {
        if (exception.action === "skip") {
          skippedProductKeys.push(exception.product_key);
          itemMap.delete(exception.product_key);
          return;
        }
        if (exception.quantity && exception.unit) {
          itemMap.set(exception.product_key, {
            productKey: exception.product_key,
            quantity: Number(exception.quantity),
            unit: exception.unit,
          });
        }
      });

    return {
      date,
      dayLabel: dateLabelFormatter.format(dateFromYmd(date)),
      items: paused ? [] : [...itemMap.values()],
      paused,
      skippedProductKeys: paused ? [] : skippedProductKeys,
    };
  });
}

export function estimateCompletionDate(
  calendar: CalendarDay[],
  remainingDeliveries: number,
) {
  if (remainingDeliveries <= 0) return "Complete";
  let milkDeliveries = 0;
  for (const day of calendar) {
    if (day.items.some((item) => item.productKey === "milk")) {
      milkDeliveries += 1;
      if (milkDeliveries === remainingDeliveries) return day.date;
    }
  }
  return "Beyond current preview";
}
