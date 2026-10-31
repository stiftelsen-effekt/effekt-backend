import { Decimal } from "decimal.js";

export function sumWithPrecision(input: (string | number | Decimal)[]) {
  var total = new Decimal(0);

  for (var i = 0; i < input.length; i++) {
    let toAdd;
    let isDecimal = input[i] instanceof Decimal;
    let type = typeof input[i];
    if (type === "string") toAdd = new Decimal(input[i]);
    else if (isDecimal || type === "number") toAdd = input[i];
    else
      throw new Error(
        "Invalid input in sumWithPrecision method, use either string, number or decimal",
      );
    total = total.add(toAdd);
  }

  return total.toString();
}
