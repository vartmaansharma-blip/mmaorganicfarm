export const FARM_PRODUCTS = [
  { id: "paneer", name: "Fresh paneer", price: 400, unit: "1 kg" },
  { id: "ghee", name: "Farm ghee", price: 750, unit: "1 litre" },
  { id: "papaya", name: "Papaya", price: 80, unit: "1 kg" },
  { id: "sweets", name: "Fresh milk sweets", price: 450, unit: "1 kg" },
] as const;

export type FarmProductId = (typeof FARM_PRODUCTS)[number]["id"];
export type FarmProductFrequency = "once" | "weekly";

export type FarmProductSelection = {
  frequency: FarmProductFrequency;
  id: FarmProductId;
  name: string;
  price: number;
  unit: string;
};

export function parseFarmProductSelections(value: string) {
  const products = new Map(FARM_PRODUCTS.map((product) => [product.id, product]));

  return value.split(",").flatMap((entry): FarmProductSelection[] => {
    const [id, rawFrequency] = entry.split(":");
    const product = products.get(id as FarmProductId);
    const frequency = rawFrequency === "weekly" ? "weekly" : "once";

    return product ? [{ ...product, frequency }] : [];
  });
}

export function serializeFarmProductSelections(
  selections: Array<Pick<FarmProductSelection, "frequency" | "id">>,
) {
  return selections.map(({ frequency, id }) => `${id}:${frequency}`).join(",");
}
