export const FARM_PRODUCTS = [
  { id: "paneer", name: "Fresh paneer", price: 200, unit: "500 g" },
  { id: "ghee", image: "/ghee-500g.png", name: "Farm ghee", price: 375, unit: "500 g" },
] as const;

export type FarmProductId = (typeof FARM_PRODUCTS)[number]["id"];
export type FarmProductFrequency = "once" | "weekly";

export type FarmProductSelection = {
  days: number[];
  frequency: FarmProductFrequency;
  id: FarmProductId;
  name: string;
  price: number;
  quantity: number;
  unit: string;
};

export function parseFarmProductSelections(value: string) {
  const products = new Map(FARM_PRODUCTS.map((product) => [product.id, product]));

  return value.split(/[;,]/).flatMap((entry): FarmProductSelection[] => {
    const [id, rawFrequency, rawQuantity, rawDays = ""] = entry.split(":");
    const product = products.get(id as FarmProductId);
    const frequency = rawFrequency === "weekly" ? "weekly" : "once";
    const parsedQuantity = Number(rawQuantity);
    const quantity =
      Number.isInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= 5
        ? parsedQuantity
        : 1;
    const days = rawDays
      .split(".")
      .map(Number)
      .filter((day, index, all) =>
        Number.isInteger(day) && day >= 1 && day <= 7 && all.indexOf(day) === index,
      )
      .sort((a, b) => a - b);

    return product
      ? [{ ...product, days: frequency === "weekly" ? days : [], frequency, quantity }]
      : [];
  });
}

export function serializeFarmProductSelections(
  selections: Array<
    Pick<FarmProductSelection, "days" | "frequency" | "id" | "quantity">
  >,
) {
  return selections
    .map(({ days, frequency, id, quantity }) =>
      [id, frequency, quantity, frequency === "weekly" ? days.join(".") : ""]
        .filter((part, index) => index < 3 || part !== "")
        .join(":"),
    )
    .join(";");
}
