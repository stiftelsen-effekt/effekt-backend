import { describe, expect, it } from "vitest";
import { currencyForLocale } from "./currency";

describe("currencyForLocale", () => {
  it("maps the site locale to its currency", () => {
    expect(currencyForLocale("no")).toBe("NOK");
    expect(currencyForLocale("sv")).toBe("SEK");
    expect(currencyForLocale("dk")).toBe("DKK");
    expect(currencyForLocale("et")).toBe("EUR");
    expect(currencyForLocale(undefined)).toBe("NOK");
  });
});
