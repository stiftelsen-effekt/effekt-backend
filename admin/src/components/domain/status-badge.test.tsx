import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge, statusVariant } from "./status-badge";

describe("StatusBadge", () => {
  it("maps domain statuses to variants", () => {
    expect(statusVariant("ACTIVE")).toBe("success");
    expect(statusVariant("pending")).toBe("warning");
    expect(statusVariant("STOPPED")).toBe("muted");
    expect(statusVariant("SOMETHING_ELSE")).toBe("neutral");
  });

  it("humanizes the label", () => {
    render(<StatusBadge status="NOT_STARTED" />);
    expect(screen.getByText("Not started")).toBeInTheDocument();
  });
});
