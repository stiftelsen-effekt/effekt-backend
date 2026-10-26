import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MultiSelectFilter, NumberRangeFilter } from "./fields";
import { binValues } from "./histogram-range-filter";

describe("MultiSelectFilter", () => {
  it("adds and removes values in option order", async () => {
    const onChange = vi.fn();
    const options = [
      { value: "a", label: "Alpha" },
      { value: "b", label: "Beta" },
    ];
    render(
      <MultiSelectFilter label="Method" options={options} value={["b"]} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Alpha" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "Beta" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("NumberRangeFilter", () => {
  it("commits parsed numbers on Enter", async () => {
    const onChange = vi.fn();
    render(<NumberRangeFilter label="Sum" value={{}} onChange={onChange} />);
    await userEvent.type(screen.getByLabelText("Minimum"), "1 000{Enter}");
    expect(onChange).toHaveBeenLastCalledWith({ min: 1000, max: undefined });
  });
});

describe("binValues", () => {
  it("counts values into bins, clamping overflow into the last bin", () => {
    expect(binValues([5, 15, 15, 99], [0, 10, 20])).toEqual([
      { from: 0, to: 10, count: 1 },
      { from: 10, to: 20, count: 3 },
    ]);
  });
});
