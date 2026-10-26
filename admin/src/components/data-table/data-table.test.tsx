import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createColumns, DataTable } from "./index";

type Row = { id: number; name: string; amount: number };
const col = createColumns<Row>();
const columns = col.columns([
  col.accessor("id", { header: "ID", meta: { numeric: true } }),
  col.accessor("name", { header: "Name" }),
  col.accessor("amount", { header: "Amount", meta: { numeric: true } }),
]);
const rows: Row[] = [
  { id: 1, name: "Ada", amount: 100 },
  { id: 2, name: "Grace", amount: 2500 },
];

describe("DataTable", () => {
  it("renders rows with numeric columns right-aligned", () => {
    render(<DataTable columns={columns} data={rows} />);
    const cell = screen.getByText("2500");
    expect(cell.closest("td")).toHaveClass("text-right", "num");
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows the empty state", () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("shows skeleton rows while loading", () => {
    const { container } = render(<DataTable columns={columns} data={undefined} isLoading />);
    expect(container.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(0);
  });

  it("reports sorting changes for server-side sorting", async () => {
    const onSortingChange = vi.fn();
    render(
      <DataTable columns={columns} data={rows} sorting={[]} onSortingChange={onSortingChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(onSortingChange).toHaveBeenCalledWith([{ id: "name", desc: false }]);
  });

  it("calls onRowClick with the row on click and Enter", async () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} onRowClick={onRowClick} />);
    const row = screen.getByText("Grace").closest("tr")!;
    await userEvent.click(row);
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(onRowClick.mock.calls[0]![0]).toEqual(rows[1]);
  });

  it("supports row selection", async () => {
    const onRowSelectionChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        rowSelection={{}}
        onRowSelectionChange={onRowSelectionChange}
      />,
    );
    const row = screen.getByText("Ada").closest("tr")!;
    await userEvent.click(within(row).getByRole("checkbox"));
    expect(onRowSelectionChange).toHaveBeenCalledWith({ "1": true });
  });
});
