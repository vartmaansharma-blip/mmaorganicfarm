export const CAPACITY_PRODUCTS = [
  {
    id: "milk",
    inputLabel: "Litres per day",
    name: "Fresh milk",
    shortUnit: "L",
    step: "0.5",
    unitLabel: "litres",
  },
  {
    id: "paneer",
    inputLabel: "500 g packs per day",
    name: "Fresh paneer",
    shortUnit: "packs",
    step: "1",
    unitLabel: "500 g packs",
  },
  {
    id: "ghee",
    inputLabel: "500 g jars per day",
    name: "Farm ghee",
    shortUnit: "jars",
    step: "1",
    unitLabel: "500 g jars",
  },
] as const;

export type CapacityProductId = (typeof CAPACITY_PRODUCTS)[number]["id"];

export function isCapacityProductId(value: string): value is CapacityProductId {
  return CAPACITY_PRODUCTS.some((product) => product.id === value);
}

export function capacityProduct(value: string) {
  return CAPACITY_PRODUCTS.find((product) => product.id === value) ?? CAPACITY_PRODUCTS[0];
}

export function formatCapacityQuantity(value: number | string) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
