import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownToLineIcon, SmartphoneIcon } from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/auth";
import { BarChart } from "@/components/charts";
import type { AttentionItem } from "@/components/domain/attention-list";
import { ErrorState } from "@/components/domain/error-state";
import { Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { PageSection } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useOpenReviewItems } from "@/features/home/review-queue-counts";
import { formatDate, formatMoney } from "@/lib/format";
import { compareMoney, moneyToNumber, sumMoney } from "@/lib/money";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/_app/")({
  component: HomePage,
});

function HomePage() {
  const trpc = useTRPC();
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const todayIso = isoDay(today);
  const months = useMemo(() => lastMonths(today), [today]);
  const thisMonth = months.at(-1)!;
  const lastMonth = months.at(-2)!;

  // Needs attention
  const openReviewItems = useOpenReviewItems();
  const missingAvtaleGiro = useQuery(trpc.giro.avtalegiro.missing.queryOptions({ date: todayIso }));
  const failedCharges = useQuery(
    trpc.vipps.charges.list.queryOptions({
      page: 0,
      limit: 1,
      filter: { statuses: ["FAILED"], dueDate: { from: thisMonth.fromDate, to: todayIso } },
    }),
  );

  // This month
  const monthly = useQuery(trpc.donations.totalMonthly.queryOptions());
  const costs = useQuery(trpc.donations.transactionCostsReport.queryOptions());
  const vippsReport = useQuery(trpc.vipps.agreements.report.queryOptions());
  const avtaleGiroReport = useQuery(trpc.giro.avtalegiro.report.queryOptions());

  // Last 12 months by cause area
  const causeAreas = useQuery(trpc.config.causeAreas.listAll.queryOptions());
  const totals = useQueries({
    queries: months.map((month) =>
      trpc.donations.total.queryOptions({ fromDate: month.fromDate, toDate: month.toDate }),
    ),
  });

  const logs = useQuery(trpc.reports.logs.list.queryOptions({ page: 0, limit: 6 }));

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

  const statsLoading = monthly.isPending || costs.isPending;
  const statsError = monthly.error ?? costs.error;
  const stats = statsError ? (
    <ErrorState
      error={statsError}
      onRetry={() => {
        void monthly.refetch();
        void costs.refetch();
      }}
    />
  ) : statsLoading ? (
    <Skeleton className="h-20" />
  ) : (
    <StatGroup>
      <Stat
        label={`Donations in ${monthName(thisMonth.key)}`}
        value={<Money value={thisMonthSum} />}
        hint={
          <>
            <Money value={lastMonthSum} /> in {monthName(lastMonth.key)}
          </>
        }
      />
      <Stat
        label="Transaction costs"
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
      {agreements && (
        <Stat
          label="Active agreements"
          value={<Num value={agreements.count} />}
          hint={
            <>
              <Money value={agreements.monthly} /> a month
            </>
          }
        />
      )}
      {agreements && (
        <Stat
          label="Agreements started"
          value={<Num value={agreements.started} />}
          hint={
            <>
              <Num value={agreements.stopped} /> stopped this month
            </>
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
      attentionLoading={missingAvtaleGiro.isPending || failedCharges.isPending}
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
          ) : chartData ? (
            <BarChart
              data={chartData.rows}
              xKey="month"
              stacked
              format="money"
              xFormatter={monthTick}
              series={chartData.series}
              className="h-60"
            />
          ) : (
            <Skeleton className="h-60" />
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
