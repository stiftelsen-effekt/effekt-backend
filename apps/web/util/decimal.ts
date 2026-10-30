/**
 * A decimal amount from the API as a number. Our backend sends MySQL DECIMAL columns as strings
 * ("500.00"), the Danish backend sends numbers, and aggregates can be null; null counts as 0.
 */
export const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : parseFloat(value);
};
