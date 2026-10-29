import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { ErrorState } from "@/components/domain/error-state";
import { Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { PageSection } from "@/components/templates";
import { lastMonths, NEW_DONOR_MONTHS } from "@/features/analysis/donor-cohorts";
import { formatDate, formatNumber } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

const SPARK_MONTHS = 12;

/**
 * Home: this month's new first-time donors and their volume, with a 12-month sparkline of the
 * count. Same query as the Analysis page (24 months), so moving between them costs nothing.
 */
export function NewDonorsCard() {
  const trpc = useTRPC();
  const query = useQuery(trpc.analysis.newDonors.queryOptions({ months: NEW_DONOR_MONTHS }));
  const data = query.data;
  const months = data ? lastMonths(data, SPARK_MONTHS) : undefined;
  const current = months?.at(-1);
  const previous = months?.at(-2);
  const monthName = (key: string) => formatDate(`${key}-01`, "month").split(" ")[0];

  return (
    <PageSection
      title="New donors"
      actions={
        <Link
          to="/analysis"
          className="inline-flex items-center gap-1 rounded-xs text-sm font-semibold text-accent hover:underline focus-ring"
        >
          Cohorts and sources
          <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      }
    >
      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <StatGroup className="md:grid-cols-[1fr_1fr_2fr] md:grid-flow-row max-md:[&>*:nth-child(3)]:col-span-2">
          <Stat
            label={
              current ? `First-time donors in ${monthName(current.month)}` : "First-time donors"
            }
            pending={!current}
            placeholder="000"
            value={current && <Num value={current.donors} />}
            hint={
              previous && (
                <>
                  <Num value={previous.donors} /> in {monthName(previous.month)}
                </>
              )
            }
          />
          <Stat
            label="Their donations"
            pending={!current}
            value={current && <Money value={current.volume} />}
            hint="in their first month"
          />
          <div className="grid content-start gap-1 px-4 py-3">
            <span className="text-xs text-muted-foreground">First-time donors, last 12 months</span>
            {months ? (
              <Sparkline values={months.map((m) => m.donors)} labels={months.map((m) => m.month)} />
            ) : (
              <div className="h-12 w-full" />
            )}
          </div>
        </StatGroup>
      )}
    </PageSection>
  );
}

/** A small line of the last months' counts, the current (partial) month as a dot */
function Sparkline({ values, labels }: { values: number[]; labels: string[] }) {
  const width = 240;
  const height = 48;
  const max = Math.max(1, ...values);
  const x = (i: number) => (values.length < 2 ? 0 : (i / (values.length - 1)) * (width - 4) + 2);
  const y = (v: number) => height - 3 - (v / max) * (height - 6);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const last = values.length - 1;
  const description = `First-time donors per month, ${labels[0]} to ${labels[last]}: ${values
    .map((v) => formatNumber(v))
    .join(", ")}`;
  return (
    <svg
      role="img"
      aria-label={description}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-12 w-full overflow-visible"
    >
      <path
        d={path.join(" ")}
        fill="none"
        stroke="var(--chart-1)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <path
        d={`M${x(last).toFixed(1)},${y(values[last] ?? 0).toFixed(1)}h0`}
        stroke="var(--chart-1)"
        strokeWidth={5}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
