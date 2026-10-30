import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Money } from "./format";
import { Stat } from "./stat";

const plain = (text: string | null) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

describe("Money precision", () => {
  it("is exact (two decimals) by default", () => {
    render(<Money value="1500" data-testid="m" />);
    expect(plain(screen.getByTestId("m").textContent)).toBe("1 500,00 kr");
  });

  it("rounds to whole kroner inside a Stat, value and hint", () => {
    render(
      <Stat
        label="Collected"
        value={<Money value="1234.50" data-testid="value" />}
        hint={<Money value="99.99" data-testid="hint" />}
      />,
    );
    expect(plain(screen.getByTestId("value").textContent)).toBe("1 235 kr");
    expect(plain(screen.getByTestId("hint").textContent)).toBe("100 kr");
  });

  it("lets an explicit precision win over the surrounding default", () => {
    render(
      <Stat label="Balance" value={<Money value="10.30" precision="exact" data-testid="m" />} />,
    );
    expect(plain(screen.getByTestId("m").textContent)).toBe("10,30 kr");
  });
});
