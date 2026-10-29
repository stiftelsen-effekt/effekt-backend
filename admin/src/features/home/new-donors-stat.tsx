import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";
import { Money, Num } from "@/components/domain/format";
import { Sparkline } from "@/components/domain/sparkline";
import { Stat } from "@/components/domain/stat";
import { lastMonths, NEW_DONOR_MONTHS } from "@/features/analysis/donor-cohorts";
import { formatDate } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

/** As many months as the other Home sparklines (`home.trends`) */
const SPARK_MONTHS = 13;

const monthName = (key: string) => formatDate(`${key}-01`, "month").split(" ")[0];

/**
 * Home: this month's first-time donors as a stat in the "This month" grid, with their volume,
 * last month's count and a 13-month sparkline. The title links to Analysis. Same query as the
 * Analysis page (24 months), so moving between them costs nothing.
 */
export function NewDonorsStat({ className }: { className?: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.analysis.newDonors.queryOptions({ months: NEW_DONOR_MONTHS }));
  const months = query.data ? lastMonths(query.data, SPARK_MONTHS) : undefined;
  const current = months?.at(-1);
  const previous = months?.at(-2);

  const label = (
    <Link
      to="/analysis"
      className="inline-flex items-center gap-1 rounded-xs hover:text-foreground hover:underline focus-ring"
    >
      {current ? `First-time donors in ${monthName(current.month)}` : "First-time donors"}
      <ArrowRightIcon className="size-3.5" aria-hidden />
    </Link>
  );

  if (query.isError) {
    return (
      <Stat
        className={className}
        label={label}
        value="–"
        hint={
          <>
            Couldn't load.{" "}
            <button
              type="button"
              className="rounded-xs font-semibold text-accent hover:underline focus-ring"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </>
        }
      />
    );
  }

  return (
    <Stat
      className={className}
      label={label}
      pending={!current}
      placeholder="000"
      value={current && <Num value={current.donors} />}
      chart={
        <Sparkline
          label={`First-time donors, last ${SPARK_MONTHS} months`}
          months={months?.map((month) => month.month)}
          series={[{ label: "First-time donors", values: months?.map((m) => m.donors) ?? [] }]}
          partialLast
        />
      }
      hint={
        current &&
        previous && (
          <>
            <Money value={current.volume} /> given · <Num value={previous.donors} /> in{" "}
            {monthName(previous.month)}
          </>
        )
      }
    />
  );
}
