export const LOW_STOCK_THRESHOLD = 5;

export type StockState = "in_stock" | "low_stock" | "out_of_stock";

export function stockState(stock: number): StockState {
  if (stock <= 0) return "out_of_stock";
  if (stock <= LOW_STOCK_THRESHOLD) return "low_stock";
  return "in_stock";
}

export function stockLabel(stock: number): string {
  const state = stockState(stock);
  if (state === "out_of_stock") return "Out of stock";
  if (state === "low_stock") return `Only ${stock} left`;
  return "In stock";
}
