import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLineIcon, SmartphoneIcon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useAuth } from "@/auth";
import { BarChart } from "@/components/charts";
import type { AttentionItem } from "@/components/domain/attention-list";
import { ErrorState } from "@/components/domain/error-state";
import { Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import {
  avtaleGiroCheckAttention,
  HomeView,
  reviewQueueAttention,
} from "@/features/home/home-view";
import {
  greeting,
  isoDay,
  lastMonths,
  monthlyByCauseArea,
  monthSum,
  monthTick,
} from "@/features/home/model";
import { RECENT_IMPORTS } from "@/features/home/home-view";
import { reviewQueueCountsOptions } from "@/features/home/review-queue-counts";
import { formatDate, formatMoney } from "@/lib/format";
import { compareMoney, moneyToNumber, sumMoney } from "@/lib/money";
import { createPersistentStore } from "@/lib/persistent-store";
import { loadPage } from "@/lib/route-data";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/")({
  loader: ({ context: { queryClient, trpc }, cause }) => {
    const q = homeQueries(trpc, new Date());
    // Coming back to Home waits briefly for the top of the page (attention and this month);
    // the chart and recent imports may follow.
    return loadPage(
      queryClient,
      cause,
      [q.reviewCounts, q.missingAvtaleGiro, q.failedCharges, q.monthly, q.costs],
      [q.vippsReport, q.avtaleGiroReport, q.causeAreas, ...q.totals, q.logs],
    );
  },
  component: HomePage,
});

/**
 * How many attention items Home showed last time (per browser). The list's placeholder
 * reserves that many rows, so on a reload the page below it doesn't jump when they arrive.
 */
const lastAttentionCount = createPersistentStore("home-attention-rows", 1);

function homeQueries(trpc: ReturnType<typeof useTRPC>, today: Date) {
  const todayIso = isoDay(today);
  const months = lastMonths(today);
  const thisMonth = months.at(-1)!;
  return {
    months,
    reviewCounts: reviewQueueCountsOptions(trpc),
    missingAvtaleGiro: trpc.giro.avtalegiro.missing.queryOptions({ date: todayIso }),
    failedCharges: trpc.vipps.charges.list.queryOptions({
      page: 0,
      limit: 1,
      filter: { statuses: ["FAILED"], dueDate: { from: thisMonth.fromDate, to: todayIso } },
    }),
    monthly: trpc.donations.totalMonthly.queryOptions(),
    costs: trpc.donations.transactionCostsReport.queryOptions(),
    vippsReport: trpc.vipps.agreements.report.queryOptions(),
    avtaleGiroReport: trpc.giro.avtalegiro.report.queryOptions(),
    causeAreas: trpc.config.causeAreas.listAll.queryOptions(),
    totals: months.map((month) =>
      trpc.donations.total.queryOptions({ fromDate: month.fromDate, toDate: month.toDate }),
    ),
    logs: trpc.reports.logs.list.queryOptions({ page: 0, limit: RECENT_IMPORTS }),
  };
}

function HomePage() {
  const trpc = useTRPC();
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const q = useMemo(() => homeQueries(trpc, today), [trpc, today]);
  const months = q.months;
  const thisMonth = months.at(-1)!;
  const lastMonth = months.at(-2)!;

  // Needs attention
  const reviewCounts = useQuery(q.reviewCounts);
  const openReviewItems = reviewCounts.data?.open;
  const missingAvtaleGiro = useQuery(q.missingAvtaleGiro);
  const failedCharges = useQuery(q.failedCharges);

  // This month
  const monthly = useQuery(q.monthly);
  const costs = useQuery(q.costs);
  const vippsReport = useQuery(q.vippsReport);
  const avtaleGiroReport = useQuery(q.avtaleGiroReport);

  // Last 12 months by cause area
  const causeAreas = useQuery(q.causeAreas);
  const totals = useQueries({ queries: q.totals });

  const logs = useQuery(q.logs);

  const attention: AttentionItem[] = [
    ...(openReviewItems !== undefined ? reviewQueueAttention(openReviewItems) : []),
    ...(missingAvtaleGiro.data?.length
      ? [
          {
            ...avtaleGiroCheckAttention(missingAvtaleGiro.data.length),
            description: "Charged today with no donation registered yet.",
          },
        ]
      : []),
    ...(failedCharges.data?.statistics.numCharges
      ? [
          {
            id: "vipps-failed",
            icon: SmartphoneIcon,
            tone: "danger" as const,
            title: "Failed Vipps charges",
            count: failedCharges.data.statistics.numCharges,
            description: `Due this month, ${formatMoney(
              failedCharges.data.statistics.sumCharges,
            )} in total.`,
            href: "/charges",
            action: "See charges",
          },
        ]
      : []),
  ];

  const attentionPending =
    reviewCounts.isPending || missingAvtaleGiro.isPending || failedCharges.isPending;
  useEffect(() => {
    if (!attentionPending) lastAttentionCount.set(Math.max(1, attention.length));
  }, [attentionPending, attention.length]);

  const thisMonthSum = monthly.data && monthSum(monthly.data, thisMonth.year, thisMonth.month);
  const lastMonthSum = monthly.data && monthSum(monthly.data, lastMonth.year, lastMonth.month);
  const monthName = (key: string) => formatDate(`${key}-01`, "month").split(" ")[0];
  const costThisMonth = costs.data?.costCurrentMonthToDate ?? "0";
  const costShare =
    thisMonthSum && compareMoney(thisMonthSum, 0) > 0
      ? moneyToNumber(costThisMonth) / moneyToNumber(thisMonthSum)
      : undefined;

  const agreements =
    vippsReport.data && avtaleGiroReport.data
      ? {
          count: vippsReport.data.activeAgreementCount + avtaleGiroReport.data.activeAgreementCount,
          monthly: sumMoney([
            vippsReport.data.totalAgreementSum,
            avtaleGiroReport.data.totalAgreementSum,
          ]),
          started: vippsReport.data.activatedThisMonth + avtaleGiroReport.data.activatedThisMonth,
          stopped: vippsReport.data.stoppedThisMonth + avtaleGiroReport.data.stoppedThisMonth,
        }
      : undefined;

  const statsError = monthly.error ?? costs.error;
  // The four stats are always there, each a placeholder until its own data is in, so the
  // strip has its final layout from the start.
  const agreementsPending = !agreements && !vippsReport.isError && !avtaleGiroReport.isError;
  const stats = statsError ? (
    <ErrorState
      error={statsError}
      onRetry={() => {
        void monthly.refetch();
        void costs.refetch();
      }}
    />
  ) : (
    <StatGroup>
      <Stat
        label={`Donations in ${monthName(thisMonth.key)}`}
        pending={monthly.isPending}
        value={<Money value={thisMonthSum} />}
        hint={
          <>
            <Money value={lastMonthSum} /> in {monthName(lastMonth.key)}
          </>
        }
      />
      <Stat
        label="Transaction costs"
        pending={costs.isPending || monthly.isPending}
        value={<Money value={costThisMonth} />}
        hint={
          costShare !== undefined ? (
            <>
              <Num value={costShare} percent /> of donations
            </>
          ) : (
            "so far this month"
          )
        }
      />
      {(agreements || agreementsPending) && (
        <Stat
          label="Active agreements"
          pending={agreementsPending}
          placeholder="0 000"
          value={agreements && <Num value={agreements.count} />}
          hint={
            agreements && (
              <>
                <Money value={agreements.monthly} /> a month
              </>
            )
          }
        />
      )}
      {(agreements || agreementsPending) && (
        <Stat
          label="Agreements started"
          pending={agreementsPending}
          placeholder="00"
          value={agreements && <Num value={agreements.started} />}
          hint={
            agreements && (
              <>
                <Num value={agreements.stopped} /> stopped this month
              </>
            )
          }
        />
      )}
    </StatGroup>
  );

  const chartError = causeAreas.error ?? totals.find((query) => query.error)?.error;
  const chartLoading = causeAreas.isPending || totals.some((query) => query.isPending);
  const chartData =
    causeAreas.data && !chartLoading
      ? monthlyByCauseArea(
          months,
          totals.map((query) => query.data),
          causeAreas.data,
        )
      : undefined;

  return (
    <HomeView
      greeting={greeting(user?.givenName, today)}
      attention={attention}
      attentionLoading={attentionPending && lastAttentionCount.get()}
      stats={stats}
      chart={
        <PageSection title="Last 12 months" description="Donations by cause area">
          {chartError ? (
            <ErrorState
              error={chartError}
              onRetry={() => {
                void causeAreas.refetch();
                totals.forEach((query) => void query.refetch());
              }}
            />
          ) : (
            <BarChart
              data={chartData?.rows}
              xKey="month"
              stacked
              format="money"
              xFormatter={monthTick}
              series={chartData?.series ?? []}
              className="h-60"
            />
          )}
        </PageSection>
      }
      recentImports={logs.data?.rows}
      recentImportsError={
        logs.error && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      }
      actions={
        <Button variant="primary" asChild>
          <Link to="/import">
            <ArrowDownToLineIcon />
            Import payments
          </Link>
        </Button>
      }
    />
  );
}
