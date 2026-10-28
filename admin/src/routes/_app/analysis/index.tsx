import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { DetailPage, PageSection } from "@/components/templates";
import { SkeletonText } from "@/components/ui/skeleton";
import { CountUpMoney } from "@/features/analysis/count-up";
import { milestoneLabel, progress, type Overview } from "@/features/analysis/model";
import { formatMoney } from "@/lib/format";
import { loadPage } from "@/lib/route-data";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/analysis/")({
  loader: ({ context: { queryClient, trpc }, cause }) =>
    loadPage(queryClient, cause, trpc.analysis.overview.queryOptions()),
  component: AnalysisOverviewPage,
});

/** The hatch for pledges: decided, not received. Same in the bar and its legend. */
const hatch =
  "bg-[repeating-linear-gradient(135deg,var(--color-chart-1)_0_2px,transparent_2px_6px)]";

function AnalysisOverviewPage() {
  const trpc = useTRPC();
  const overview = useQuery(trpc.analysis.overview.queryOptions());
  const data = overview.data;

  return (
    <DetailPage
      title="Analysis"
      meta={["Measured from the donations; open pledges shown on top, never mixed in"]}
      stats={
        overview.isError ? null : (
          <StatGroup>
            <Stat
              label={data ? `Collected in ${data.thisYear.year}` : "Collected this year"}
              pending={!data}
              placeholder="00 000 000 kr"
              value={data && <Money value={data.thisYear.sum} />}
              hint="All confirmed donations so far this year"
            />
            <Stat
              label="Through time, measured"
              pending={!data}
              placeholder="000 000 000 kr"
              value={data && <Money value={data.throughTime.measured} />}
              hint={
                data && (
                  <>
                    <Num value={data.throughTime.donations} /> donations
                    {data.throughTime.from && (
                      <>
                        {" "}
                        since <DateTime value={data.throughTime.from} />
                      </>
                    )}
                  </>
                )
              }
            />
            <Stat
              label="Open pledges"
              pending={!data}
              placeholder="00 000 000 kr"
              value={data && <Money value={data.pledges.open} />}
              hint={
                data && (
                  <Link to="/analysis/pledges" className="text-accent hover:underline">
                    <Num value={data.pledges.count} />{" "}
                    {data.pledges.count === 1 ? "pledge" : "pledges"} decided, not received
                  </Link>
                )
              }
            />
          </StatGroup>
        )
      }
    >
      {overview.isError ? (
        <ErrorState
          error={overview.error}
          title="Couldn't load the overview"
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <ThroughTime overview={data} />
      )}
    </DetailPage>
  );
}

function ThroughTime({ overview }: { overview: Overview | undefined }) {
  const since = overview?.throughTime.from?.slice(0, 4);
  return (
    <PageSection
      title={`Given to the recipients${since ? ` since ${since}` : ""}, with open pledges`}
      description="Excludes support for our own operations (Drift). Includes Influenced donations."
    >
      <div className="grid gap-4">
        <p className="text-3xl font-semibold tracking-tight">
          {overview ? (
            <CountUpMoney value={overview.withPledges.sum} />
          ) : (
            <SkeletonText>000 000 000 kr</SkeletonText>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {overview ? (
            <>
              <Money
                value={overview.throughTime.measured}
                className="font-semibold text-foreground"
              />{" "}
              measured
              {overview.pledges.count > 0 && (
                <>
                  {" "}
                  +{" "}
                  <Money
                    value={overview.pledges.open}
                    className="font-semibold text-foreground"
                  />{" "}
                  in <Num value={overview.pledges.count} /> open{" "}
                  {overview.pledges.count === 1 ? "pledge" : "pledges"}
                </>
              )}
            </>
          ) : (
            <SkeletonText>000 000 000 kr measured + 00 000 000 kr in 0 open pledges</SkeletonText>
          )}
        </p>
        <Milestone overview={overview} />
      </div>
    </PageSection>
  );
}

/** Progress line to the milestone: measured solid, open pledges hatched after it. */
function Milestone({ overview }: { overview: Overview | undefined }) {
  const widths = overview ? progress(overview) : { measured: 0, pledges: 0 };
  const label = overview ? milestoneLabel(overview.withPledges.milestone) : "200 MNOK";
  const description = overview
    ? `Progress to ${label}: ${formatMoney(
        overview.throughTime.measured,
      )} measured and ${formatMoney(overview.pledges.open)} in open pledges, ${
        overview.withPledges.passed
          ? "together past the milestone"
          : `${formatMoney(overview.withPledges.remaining)} to go`
      }.`
    : `Progress to ${label}`;
  return (
    <div className="grid gap-2">
      <div
        role="img"
        aria-label={description}
        className="relative h-3 overflow-hidden rounded-xs bg-muted ring-1 ring-border ring-inset"
      >
        <div
          className="absolute inset-y-0 left-0 bg-chart-1 transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${widths.measured}%` }}
        />
        <div
          className={`absolute inset-y-0 transition-[left,width] duration-700 ease-out motion-reduce:transition-none ${hatch}`}
          style={{ left: `${widths.measured}%`, width: `${widths.pledges}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-xs bg-chart-1" aria-hidden />
            Measured
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`size-2.5 rounded-xs ring-1 ring-chart-1 ring-inset ${hatch}`}
              aria-hidden
            />
            Open pledges
          </span>
        </span>
        <span className="num">
          {!overview ? (
            <SkeletonText>00 000 000 kr to 200 MNOK, with pledges</SkeletonText>
          ) : overview.withPledges.passed ? (
            `${label} passed, with pledges`
          ) : (
            `${formatMoney(overview.withPledges.remaining)} to ${label}, with pledges`
          )}
        </span>
      </div>
    </div>
  );
}
