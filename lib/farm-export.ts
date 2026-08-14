export type CsvValue = boolean | number | string | null | undefined;

function safeSpreadsheetValue(value: CsvValue) {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function createCsv(rows: CsvValue[][]) {
  const body = rows
    .map((row) =>
      row
        .map((value) => `"${safeSpreadsheetValue(value).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\r\n");

  return `\ufeff${body}\r\n`;
}

export function exportDateStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(date);
}
