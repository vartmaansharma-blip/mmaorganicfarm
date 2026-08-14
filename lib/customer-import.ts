export type CustomerImportRow = {
  address?: string;
  area?: string;
  email?: string;
  landmark?: string;
  locality?: string;
  name?: string;
  phone?: string;
  postalCode?: string;
  route?: string;
  stopOrder?: string;
};

const HEADER_ALIASES: Record<string, keyof CustomerImportRow> = {
  address: "address",
  area: "area",
  customer: "name",
  customername: "name",
  deliveryaddress: "address",
  email: "email",
  landmark: "landmark",
  locality: "locality",
  name: "name",
  phone: "phone",
  phonenumber: "phone",
  postalcode: "postalCode",
  postcode: "postalCode",
  route: "route",
  stop: "stopOrder",
  stoporder: "stopOrder",
};

function normalizedHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsvRows(value: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let insideQuotes = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentValue += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === "," && !insideQuotes) {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      currentRow.push(currentValue);
      if (currentRow.some((cell) => cell.trim())) rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (insideQuotes) throw new Error("The CSV contains an unclosed quote.");

  currentRow.push(currentValue);
  if (currentRow.some((cell) => cell.trim())) rows.push(currentRow);
  return rows;
}

export function parseCustomerImport(value: string) {
  const rows = parseCsvRows(value.replace(/^\ufeff/, ""));
  if (rows.length < 2) {
    throw new Error("The CSV must contain a header and at least one customer.");
  }
  if (rows.length > 201) {
    throw new Error("Import no more than 200 customers at a time.");
  }

  const headers = rows[0].map((header) => HEADER_ALIASES[normalizedHeader(header)]);
  if (!headers.includes("email") && !headers.includes("phone")) {
    throw new Error("Add an Email or Phone column so customers can be matched.");
  }

  const customerRows = rows.slice(1).map((cells) => {
    const customer: CustomerImportRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const cell = (cells[index] ?? "").trim();
      if (cell) customer[header] = cell;
    });
    return customer;
  });

  return customerRows.filter((row) => row.email || row.phone);
}
