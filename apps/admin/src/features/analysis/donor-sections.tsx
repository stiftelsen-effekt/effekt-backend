import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { StackedBarLineChart } from "@/components/charts";
import { ChartFrame } from "@/components/charts/chart";
import { ErrorState } from "@/components/domain/error-state";
import { PageSection } from "@/components/templates";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SkeletonText } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { monthTick } from "@/features/home/model";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  cohortIntensity,
  DONOR_DEFINITION,
  heatBackground,
  NEW_DONOR_MONTHS,
  cohortScale,
  newDonorRows,
  sourceSeries,
  type Cohort,
  type CohortCell,
  type CohortMetric,
  type Cohorts,
} from "./donor-cohorts";

const whole = { precision: "whole" } as const;

/** New first-time donors per month: bars for the count (optionally by referral), a line for volume */
export function NewDonorsSection() {
  const trpc = useTRPC();
  const query = useQuery(trpc.analysis.newDonors.queryOptions({ months: NEW_DONOR_MONTHS }));
  const [view, setView] = useState<"total" | "referral">("total");
  const data = query.data;
  const rows = useMemo(() => data && newDonorRows(data), [data]);

  return (
    <PageSection
      title="New donors"
      description={`First-time donors per month, last ${NEW_DONOR_MONTHS} months, and what they gave in that month`}
      actions={
        <SegmentedControl
          label="Bars"
          value={view}
          onValueChange={setView}
          options={[
            { value: "total", label: "Total" },
            { value: "referral", label: "By referral" },
          ]}
        />
      }
    >
      {query.isError ? (
        <ErrorState
          error={query.error}
          title="Couldn't load new donors"
          onRetry={() => void query.refetch()}
        />
      ) : !data || !rows ? (
        <ChartFrame pending legend className="h-72" />
      ) : (
        <StackedBarLineChart
          data={rows}
          xKey="month"
          bars={
            view === "referral"
              ? sourceSeries(data)
              : [{ key: "donors", label: "New donors", color: "chart-1" }]
          }
          line={{ key: "volume", label: "Volume", color: "chart-3" }}
          format="number"
          lineFormat="money"
          xFormatter={(key) =>
            key === data.partialMonth ? `${monthTick(key)} (so far)` : monthTick(key)
          }
          className="h-72"
        />
      )}
      <p className="text-xs text-muted-foreground">
        {DONOR_DEFINITION} Volume: their donations in that first month. Referral: their earliest
        answer; none, Annet and small sources are Other / unknown.
      </p>
    </PageSection>
  );
}

/** Yearly cohorts by first donation: who gave again in each later year, and how much */
export function CohortsSection() {
  const trpc = useTRPC();
  const query = useQuery(trpc.analysis.cohorts.queryOptions());
  const [metric, setMetric] = useState<CohortMetric>("donors");

  return (
    <PageSection
      title="Cohorts"
      description="Donors by the year of their first donation, and whether they gave again in each later year"
      actions={
        <SegmentedControl
          label="Cells show"
          value={metric}
          onValueChange={setMetric}
          options={[
            { value: "donors", label: "Donors (%)" },
            { value: "volume", label: "Volume" },
          ]}
        />
      }
    >
      {query.isError ? (
        <ErrorState
          error={query.error}
          title="Couldn't load cohorts"
          onRetry={() => void query.refetch()}
        />
      ) : (
        <CohortTable data={query.data} metric={metric} />
      )}
      <p className="text-xs text-muted-foreground">
        Same definitions as above. A cohort’s first year is 100 % by definition (grey); colour is
        scaled to the largest later year. The current year is so far.
      </p>
    </PageSection>
  );
}

const placeholderYears = [2021, 2022, 2023, 2024, 2025, 2026];

function CohortTable({ data, metric }: { data: Cohorts | undefined; metric: CohortMetric }) {
  const scale = useMemo(() => (data ? cohortScale(data.cohorts, metric) : 0), [data, metric]);
  const years = data?.years ?? placeholderYears;

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md border border-border bg-surface",
        // Strong enough to see, light enough for AA text on top (checked in both themes)
        "[--heat-max:60%] dark:[--heat-max:55%]",
      )}
    >
      <table
        aria-label="Donor cohorts"
        aria-busy={!data || undefined}
        className="num w-full border-separate border-spacing-0 text-sm"
      >
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th
              scope="col"
              className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold"
            >
              Cohort
            </th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">
              Donors
            </th>
            <th scope="col" className="border-r border-border px-3 py-2 text-right font-semibold">
              First year (kr)
            </th>
            {years.map((year) => (
              <th
                key={year}
                scope="col"
                className="min-w-20 px-3 py-2 text-right font-semibold whitespace-nowrap"
              >
                {year}
                {data && year === data.partialYear && (
                  <span className="font-normal"> (so far)</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!data
            ? placeholderYears.map((year) => (
                <tr key={year} className="h-row">
                  <th scope="row" className="sticky left-0 bg-surface px-3 text-left">
                    <SkeletonText>2021</SkeletonText>
                  </th>
                  <td className="px-3 text-right">
                    <SkeletonText>0 000</SkeletonText>
                  </td>
                  <td className="border-r border-border px-3 text-right">
                    <SkeletonText>00 000 000</SkeletonText>
                  </td>
                  {placeholderYears.map((y) => (
                    <td key={y} className="px-3 text-right">
                      {y >= year && <SkeletonText>00 %</SkeletonText>}
                    </td>
                  ))}
                </tr>
              ))
            : data.cohorts.map((cohort) => (
                <tr key={cohort.year} className="h-row">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-surface px-3 text-left font-semibold"
                  >
                    {cohort.year}
                  </th>
                  <td className="px-3 text-right whitespace-nowrap">{formatNumber(cohort.size)}</td>
                  <td className="border-r border-border px-3 text-right whitespace-nowrap">
                    {formatMoney(cohort.firstYearVolume, { ...whole, currency: false })}
                  </td>
                  {years.map((year) => {
                    const cell = cohort.cells.find((c) => c.year === year);
                    return cell ? (
                      <HeatCell
                        key={year}
                        cohort={cohort}
                        cell={cell}
                        metric={metric}
                        partial={year === data.partialYear}
                        intensity={cohortIntensity(cohort, cell, metric, scale)}
                        first={year === cohort.year}
                      />
                    ) : (
                      <td key={year} aria-hidden />
                    );
                  })}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function HeatCell({
  cohort,
  cell,
  metric,
  partial,
  intensity,
  first,
}: {
  cohort: Cohort;
  cell: CohortCell;
  metric: CohortMetric;
  partial: boolean;
  intensity: number;
  /** The cohort's own first year: 100 % by definition, shown muted rather than coloured */
  first: boolean;
}) {
  const shown =
    metric === "donors"
      ? formatPercent(cell.share, { decimals: 0 })
      : formatMoney(cell.volume, { ...whole, currency: false });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <td
          className={cn(
            "px-3 text-right whitespace-nowrap",
            (first || cell.donors === 0) && "text-muted-foreground",
            first && "bg-muted",
            partial && "italic",
          )}
          style={{ backgroundColor: heatBackground(intensity) }}
        >
          {shown}
        </td>
      </TooltipTrigger>
      <TooltipContent side="top" className="num">
        <p className="font-semibold">
          {cohort.year} cohort in {cell.year}
          {partial && " (so far)"}
        </p>
        <p>
          {formatNumber(cell.donors)} of {formatNumber(cohort.size)} donors gave (
          {formatPercent(cell.share, { decimals: 1 })})
        </p>
        <p>{formatMoney(cell.volume, whole)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
