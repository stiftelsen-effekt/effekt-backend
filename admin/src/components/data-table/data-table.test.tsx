import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createColumns, DataTable, type DataTableProps } from "./index";

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
  { id: 3, name: "Linus", amount: 40 },
];

function renderTable(props: Partial<DataTableProps<Row>> = {}) {
  return render(
    <DataTable
      label="People"
      columns={columns}
      data={rows}
      getRowId={(row) => String(row.id)}
      {...props}
    />,
  );
}

const rowFor = (name: string) => screen.getByText(name).closest("tr")!;

describe("DataTable", () => {
  it("renders rows with numeric columns right-aligned", () => {
    renderTable();
    expect(screen.getByText("2500").closest("td")).toHaveClass("text-right", "num");
    expect(screen.getByRole("table", { name: "People" })).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderTable({ data: [] });
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("shows skeleton rows while loading", () => {
    const { container } = renderTable({ data: undefined, isLoading: true });
    expect(container.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(0);
  });

  it("reports sorting changes for server-side sorting", async () => {
    const onSortingChange = vi.fn();
    renderTable({ sorting: [], onSortingChange });
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(onSortingChange).toHaveBeenCalledWith([{ id: "name", desc: false }]);
  });

  it("sorts its own rows when there's no server-side sorting", async () => {
    renderTable();
    const names = () =>
      screen
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell")[1]?.textContent);
    const amount = screen.getByRole("button", { name: "Amount" });
    await userEvent.click(amount);
    const first = names();
    await userEvent.click(amount);
    const second = names();
    expect([first, second]).toContainEqual(["Grace", "Ada", "Linus"]);
    expect([first, second]).toContainEqual(["Linus", "Ada", "Grace"]);
  });

  it("opens a row on click, Enter and Space when there is no panel host", async () => {
    const onRowOpen = vi.fn();
    renderTable({ onRowOpen });
    await userEvent.click(rowFor("Grace"));
    expect(onRowOpen).toHaveBeenCalledTimes(1);
    expect(onRowOpen.mock.calls[0]![0]).toEqual(rows[1]);
    rowFor("Grace").focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onRowOpen).toHaveBeenCalledTimes(3);
  });

  it("moves between rows with arrow keys and j/k", async () => {
    renderTable({ onRowOpen: vi.fn() });
    rowFor("Ada").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(rowFor("Grace")).toHaveFocus();
    await userEvent.keyboard("j");
    expect(rowFor("Linus")).toHaveFocus();
    await userEvent.keyboard("k");
    expect(rowFor("Grace")).toHaveFocus();
  });

  it("uses a roving tab stop so Tab leaves the table", () => {
    renderTable({ onRowOpen: vi.fn() });
    const tabbable = screen.getAllByRole("row").filter((row) => row.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });

  it("supports row selection with checkboxes and x", async () => {
    const onRowSelectionChange = vi.fn();
    renderTable({ rowSelection: {}, onRowSelectionChange, onRowOpen: vi.fn() });
    await userEvent.click(within(rowFor("Ada")).getByRole("checkbox"));
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ "1": true });
    rowFor("Grace").focus();
    await userEvent.keyboard("x");
    expect(onRowSelectionChange).toHaveBeenLastCalledWith({ "2": true });
  });

  it("shows selection actions in the footer while rows are selected", () => {
    renderTable({
      rowSelection: { "1": true, "3": true },
      onRowSelectionChange: vi.fn(),
      selectionActions: (ids) => <button type="button">Export {ids.length}</button>,
    });
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export 2" })).toBeInTheDocument();
  });
});
