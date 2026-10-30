import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, RotateCwIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable } from "@/components/data-table";
import { Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Button } from "@/components/ui/button";
import { Updating } from "@/components/ui/pending";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { usePageQuery } from "@/lib/query";

/*
 * The loading rules, live, with a fake API whose latency you pick: a first load (reload)
 * shows the real layout with placeholders, but only if it takes longer than 300 ms; changing
 * the day keeps the current day on screen, dimmed, with the top progress line; the next and
 * previous day are prefetched, so stepping back and forth is instant once they're in.
 */

type Row = { id: number; donor: string; amount: number };
type Day = { day: number; rows: Row[]; expected: number; received: number };

const donors = ["Kari Nordmann", "Ola Hansen", "Ingrid Berg", "Lars Moen", "Siri Dahl", "Per Lie"];

function fakeDay(day: number): Day {
  const count = 3 + (day % 3);
  const rows = Array.from({ length: count }, (_, index) => ({
    id: 1000 + day * 10 + index,
    donor: donors[(day + index) % donors.length]!,
    amount: 200 + ((day * 7 + index * 13) % 9) * 100,
  }));
  const received = rows.reduce((sum, row) => sum + row.amount, 0);
  return { day, rows, expected: received + (day % 2) * 500, received };
}

const col = createColumns<Row>();
const columns = col.columns([
  col.accessor("id", { header: "ID", meta: { numeric: true, placeholder: "0000" } }),
  col.accessor("donor", { header: "Donor", meta: { placeholder: "Firstname Lastname" } }),
  col.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, placeholder: "0 000 kr" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
]);

const latencies = { fast: 150, slow: 1500 } as const;
type Latency = keyof typeof latencies;

export function LoadingDemo() {
  const [latency, setLatency] = useState<Latency>("slow");
  const [run, setRun] = useState(0);
  const queryClient = useQueryClient();
  return (
    <div className="grid w-full gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Simulated API latency"
          value={latency}
          onValueChange={setLatency}
          options={[
            { value: "fast", label: "Fast API (150 ms)" },
            { value: "slow", label: "Slow API (1.5 s)" },
          ]}
        />
        <Button
          size="sm"
          onClick={() => {
            queryClient.removeQueries({ queryKey: ["design-loading-demo"] });
            setRun((current) => current + 1);
          }}
        >
          <RotateCwIcon />
          Reload (first load)
        </Button>
      </div>
      {/* A new run is a first load: nothing cached, nothing to keep. */}
      <DemoDay key={run} latency={run === 0 ? 0 : latencies[latency]} />
    </div>
  );
}

function DemoDay({ latency }: { latency: number }) {
  const [day, setDay] = useState(10);
  const options = (which: number) => ({
    queryKey: ["design-loading-demo", which],
    queryFn: () =>
      new Promise<Day>((resolve) => setTimeout(() => resolve(fakeDay(which)), latency)),
    staleTime: Infinity,
  });
  const query = usePageQuery(options(day), { prefetch: [options(day - 1), options(day + 1)] });
  const data = query.data;
  const updating = query.isPlaceholderData;

  return (
    // The progress line is the app's own, along the top of the page (usePageQuery reports to it).
    <div className="grid gap-3 rounded-md border border-border bg-background p-4">
      <div className="flex items-center gap-1">
        <Button size="icon-sm" aria-label="Previous day" onClick={() => setDay(day - 1)}>
          <ChevronLeftIcon />
        </Button>
        <span className="num w-16 text-center text-sm font-semibold">Day {day}</span>
        <Button size="icon-sm" aria-label="Next day" onClick={() => setDay(day + 1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <Updating active={updating} className="grid gap-3">
        <StatGroup>
          <Stat
            label="Expected"
            pending={!data}
            value={data && <Money value={data.expected} />}
            hint={data && <>{data.rows.length} agreements</>}
          />
          <Stat
            label="Received"
            pending={!data}
            value={data && <Money value={data.received} />}
            hint={
              data && (
                <>
                  <Num value={data.rows.length} /> donations
                </>
              )
            }
          />
        </StatGroup>
        <div className="flex h-56 flex-col">
          <DataTable
            label="Demo payments"
            columns={columns}
            data={data?.rows}
            isLoading={query.isPending}
            getRowId={(row) => String(row.id)}
          />
        </div>
      </Updating>
    </div>
  );
}
