import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { addDays, parseISO } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { cellPlaceholder, createColumns, DataTable } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Status } from "@/components/domain/status";
import { DetailPage, DetailPanel } from "@/components/templates";
import { Callout } from "@/components/domain/callout";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Updating } from "@/components/ui/pending";
import { SkeletonText } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  checkDate,
  isoDay,
  summarizeCheck,
  validationDate,
  validationState,
  type ExpectedRow,
  type MissingRow,
  type ReceivedRow,
} from "@/features/agreements/avtalegiro-check";
import { shortChargeDay } from "@/features/agreements/model";
import { formatDate } from "@/lib/format";
import { avtaleGiroDayStatus } from "@/lib/status";
import { usePageQuery } from "@/lib/query";
import { loadPage } from "@/lib/route-data";
import { useTRPC } from "@/lib/trpc";

const tabs = ["missing", "expected", "received"] as const;
type Tab = (typeof tabs)[number];

export const Route = createFileRoute("/_app/avtalegiro-check")({
  validateSearch: (raw: Record<string, unknown>): { date?: string; tab?: Tab } => ({
    date: typeof raw.date === "string" ? raw.date : undefined,
    tab: tabs.includes(raw.tab as Tab) ? (raw.tab as Tab) : undefined,
  }),
  // No loaderDeps: changing the day must stay on this match (`cause: "stay"`), so the URL
  // updates at once and the page keeps the previous day itself (usePageQuery). Arriving from
  // another page waits for the day's data.
  loader: ({ context: { queryClient, trpc }, location, cause }) => {
    const { date } = location.search as { date?: string };
    const day = dayQueries(trpc, checkDate(date, new Date()));
    return loadPage(
      queryClient,
      cause,
      [day.expected, day.received, day.missing],
      [trpc.giro.avtalegiro.validation.queryOptions()],
    );
  },
  component: AvtaleGiroCheckPage,
});

const agreementLink = (id: number, children: React.ReactNode) => (
  <Link
    to="/agreements/$provider/$id"
    params={{ provider: "avtalegiro", id: String(id) }}
    className="font-semibold text-accent hover:underline focus-ring rounded-xs"
  >
    {children}
  </Link>
);

const missingCol = createColumns<MissingRow>();
const missingColumns = missingCol.columns([
  missingCol.accessor("full_name", {
    header: "Donor",
    meta: { placeholder: cellPlaceholder.name, cellClassName: "max-w-56 truncate" },
    cell: ({ row, getValue }) =>
      agreementLink(row.original.ID, getValue() || `#${row.original.ID}`),
  }),
  missingCol.accessor("email", {
    header: "Email",
    meta: { placeholder: cellPlaceholder.email, cellClassName: "max-w-64 truncate" },
  }),
  missingCol.accessor("amount", {
    header: "Amount",
    meta: { placeholder: cellPlaceholder.money, numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  missingCol.accessor("KID", {
    header: "KID",
    meta: { placeholder: cellPlaceholder.kid },
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  missingCol.accessor("cancelled", {
    header: "Cancelled",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

const expectedCol = createColumns<ExpectedRow>();
const expectedColumns = expectedCol.columns([
  expectedCol.accessor("ID", {
    header: "Agreement",
    meta: { placeholder: cellPlaceholder.id },
    cell: ({ getValue }) => agreementLink(getValue(), `#${getValue()}`),
  }),
  expectedCol.accessor("amount", {
    header: "Amount",
    meta: { placeholder: cellPlaceholder.money, numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue, row }) =>
      row.original.amountSource === "agreement" ? (
        <span title="No claim file for this date: the agreement's current amount">
          <Money value={getValue()} />
          <span aria-hidden className="text-muted-foreground">
            *
          </span>
          <span className="sr-only"> (current agreement amount)</span>
        </span>
      ) : (
        <Money value={getValue()} />
      ),
  }),
  expectedCol.accessor("KID", {
    header: "KID",
    meta: { placeholder: cellPlaceholder.kid },
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  expectedCol.accessor("payment_date", {
    header: "Charge day",
    meta: { numeric: true },
    cell: ({ getValue }) => shortChargeDay(getValue()),
  }),
  expectedCol.accessor("notice", {
    header: "Notice",
    cell: ({ getValue }) =>
      getValue() ? "Yes" : <span className="text-muted-foreground">No</span>,
  }),
  expectedCol.accessor("created", {
    header: "Created",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

const receivedCol = createColumns<ReceivedRow>();
const receivedColumns = receivedCol.columns([
  receivedCol.accessor("id", {
    header: "Donation",
    meta: {
      placeholder: cellPlaceholder.id,
      numeric: true,
      cellClassName: "text-muted-foreground w-24",
    },
  }),
  receivedCol.accessor("donor", {
    header: "Donor",
    meta: { placeholder: cellPlaceholder.name, cellClassName: "font-semibold" },
  }),
  receivedCol.accessor("sum", {
    header: "Amount",
    meta: { placeholder: cellPlaceholder.money, numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  receivedCol.accessor("kid", {
    header: "KID",
    meta: { placeholder: cellPlaceholder.kid },
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  receivedCol.accessor("timestamp", {
    header: "Registered for",
    meta: { placeholder: cellPlaceholder.date },
    cell: ({ getValue }) => <DateTime value={getValue() as string} />,
  }),
]);

/** The day's three queries; the page shows them and the loader warms them. */
function dayQueries(trpc: ReturnType<typeof useTRPC>, date: string) {
  return {
    expected: trpc.giro.avtalegiro.expected.queryOptions({ date }),
    received: trpc.giro.avtalegiro.received.queryOptions({ date }),
    missing: trpc.giro.avtalegiro.missing.queryOptions({ date }),
  };
}

/** Days the person is likely to look at next: the previous and next day, and today. */
function neighbourDays(date: string, today: string) {
  const day = parseISO(date);
  return [...new Set([isoDay(addDays(day, -1)), isoDay(addDays(day, 1)), today])].filter(
    (other) => other !== date,
  );
}

const placeholderDays = Array.from({ length: 8 }, (_, index) => index);

function AvtaleGiroCheckPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [today] = useState(() => new Date());
  const todayIso = isoDay(today);
  const date = checkDate(search.date, today);
  const tab: Tab = search.tab ?? "missing";

  // Moving between days keeps the current day on screen (dimmed) until the next is in, and
  // the neighbouring days are fetched ahead, so stepping through days doesn't flash. The
  // tables have a fixed height, so the page has the same layout whichever day it shows.
  const neighbours = neighbourDays(date, todayIso).map((day) => dayQueries(trpc, day));
  const queries = dayQueries(trpc, date);
  const expected = usePageQuery(queries.expected, {
    prefetch: neighbours.map((day) => day.expected),
  });
  const received = usePageQuery(queries.received, {
    prefetch: neighbours.map((day) => day.received),
  });
  const missing = usePageQuery(queries.missing, {
    prefetch: neighbours.map((day) => day.missing),
  });
  const validation = useQuery(trpc.giro.avtalegiro.validation.queryOptions());
  const updating =
    expected.isPlaceholderData || received.isPlaceholderData || missing.isPlaceholderData;

  // A past day without its claim file falls back to today's agreement amounts (P2-11).
  const estimated =
    date < todayIso && Boolean(expected.data?.some((row) => row.amountSource === "agreement"));

  const setDate = (next: string) =>
    void navigate({
      to: "/avtalegiro-check",
      search: (prev) => ({ ...prev, date: next === todayIso ? undefined : next }),
    });
  const shift = (days: number) => setDate(isoDay(addDays(parseISO(date), days)));
  const summary =
    expected.data && received.data && missing.data
      ? summarizeCheck(expected.data, received.data, missing.data)
      : undefined;

  const section = (
    query: { isError: boolean; error: unknown; refetch: () => unknown },
    content: React.ReactNode,
  ) =>
    query.isError ? (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    ) : (
      content
    );

  return (
    <DetailPage
      title="AvtaleGiro check"
      meta={[
        <span key="date">
          Payments due <DateTime value={date} />
        </span>,
        "Expected claims against what the OCR files registered",
      ]}
      actions={
        // Always the same four buttons, so none moves under the pointer while clicking
        // through days.
        <div className="flex items-end gap-1">
          <Button size="icon" aria-label="Previous day" onClick={() => shift(-1)}>
            <ChevronLeftIcon />
          </Button>
          <DateInput
            aria-label="Charge date"
            className="w-40"
            value={date}
            onValueChange={(value) => value && setDate(value)}
          />
          <Button size="icon" aria-label="Next day" onClick={() => shift(1)}>
            <ChevronRightIcon />
          </Button>
          <Button disabled={date === todayIso} onClick={() => setDate(todayIso)}>
            Today
          </Button>
        </div>
      }
      stats={
        <Updating active={updating}>
          {summary ? (
            <StatGroup>
              <Stat
                label="Expected"
                value={<Money value={summary.expectedSum} />}
                hint={
                  <>
                    <Num value={summary.expectedCount} /> agreements
                    {estimated && ", at current amounts*"}
                  </>
                }
              />
              <Stat
                label="Received"
                value={<Money value={summary.receivedSum} />}
                hint={
                  <>
                    <Num value={summary.receivedCount} /> donations
                  </>
                }
              />
              <Stat
                label="Missing"
                value={
                  <span className={summary.missingCount > 0 ? "text-danger" : undefined}>
                    <Money value={summary.missingSum} />
                  </span>
                }
                hint={
                  <>
                    <Num value={summary.missingCount} /> agreements without a donation
                  </>
                }
              />
            </StatGroup>
          ) : (
            <StatGroup>
              <Stat label="Expected" pending />
              <Stat label="Received" pending />
              <Stat label="Missing" pending />
            </StatGroup>
          )}
        </Updating>
      }
      aside={
        <DetailPanel title="Last month by charge day">
          {validation.isError ? (
            <div className="py-3">
              <ErrorState error={validation.error} onRetry={() => void validation.refetch()} />
            </div>
          ) : validation.data?.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No AvtaleGiro agreements to check.</p>
          ) : (
            <div
              className="-mx-4 overflow-x-auto px-4"
              aria-busy={validation.isPending || undefined}
            >
              <table className="w-full text-sm whitespace-nowrap">
                <caption className="sr-only">
                  Expected and received AvtaleGiro payments per charge day over the last month
                </caption>
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 font-normal">
                      Date
                    </th>
                    <th scope="col" className="py-2 pl-1.5 text-right font-normal">
                      Expected
                    </th>
                    <th scope="col" className="py-2 pl-1.5 text-right font-normal">
                      Received
                    </th>
                    <th scope="col" className="py-2 pl-1.5 font-normal">
                      <span className="sr-only">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!validation.data
                    ? placeholderDays.map((index) => (
                        <tr key={index} className="border-t border-border">
                          <td className="py-1.5">
                            <SkeletonText>00.00.0000</SkeletonText>
                          </td>
                          <td className="py-1.5 pl-1.5 text-right">
                            <SkeletonText>00 000 kr</SkeletonText>
                          </td>
                          <td className="py-1.5 pl-1.5 text-right">
                            <SkeletonText>00 000 kr</SkeletonText>
                          </td>
                          <td className="py-1.5 pl-1.5">
                            <SkeletonText>Some missing</SkeletonText>
                          </td>
                        </tr>
                      ))
                    : validation.data.map((row) => {
                        const day = validationDate(Number(row.date), today);
                        const current = day === date;
                        return (
                          <tr
                            key={row.date}
                            className="border-t border-border"
                            aria-current={current ? "date" : undefined}
                          >
                            <td className="py-1.5">
                              {day ? (
                                <Link
                                  to="/avtalegiro-check"
                                  search={{ date: day, tab: search.tab }}
                                  className={
                                    current
                                      ? "num font-semibold text-foreground"
                                      : "num text-accent hover:underline focus-ring rounded-xs"
                                  }
                                >
                                  {formatDate(day)}
                                </Link>
                              ) : (
                                <span className="num">{shortChargeDay(Number(row.date))}</span>
                              )}
                            </td>
                            <td className="py-1.5 pl-1.5 text-right">
                              <Money value={row.expected} precision="whole" />
                            </td>
                            <td className="py-1.5 pl-1.5 text-right">
                              <Money value={row.actual} precision="whole" />
                            </td>
                            <td className="py-1.5 pl-1.5">
                              <Status catalog={avtaleGiroDayStatus} value={validationState(row)} />
                            </td>
                          </tr>
                        );
                      })}
                </tbody>
              </table>
            </div>
          )}
        </DetailPanel>
      }
    >
      <Updating active={updating} className="grid min-w-0 gap-6">
        <Tabs
          value={tab}
          onValueChange={(value) =>
            void navigate({
              to: "/avtalegiro-check",
              search: (prev) => ({
                ...prev,
                tab: value === "missing" ? undefined : (value as Tab),
              }),
            })
          }
        >
          <TabsList>
            <TabsTrigger
              value="missing"
              count={missing.isError ? undefined : missing.data?.length ?? null}
            >
              Missing
            </TabsTrigger>
            <TabsTrigger
              value="expected"
              count={expected.isError ? undefined : expected.data?.length ?? null}
            >
              Expected
            </TabsTrigger>
            <TabsTrigger
              value="received"
              count={received.isError ? undefined : received.data?.length ?? null}
            >
              Received
            </TabsTrigger>
          </TabsList>
          <TabsContent value="missing" className="flex h-[36rem] flex-col">
            {section(
              missing,
              missing.data?.length === 0 ? (
                <EmptyState
                  title="Nothing missing"
                  description="Every agreement charged on this date has a donation registered."
                />
              ) : (
                <DataTable
                  label="Missing AvtaleGiro payments"
                  columns={missingColumns}
                  data={missing.data}
                  isLoading={missing.isPending}
                  getRowId={(row) => String(row.ID)}
                  getRowHref={(row) => `/agreements/avtalegiro/${row.ID}`}
                  onRowOpen={(row) =>
                    void navigate({
                      to: "/agreements/$provider/$id",
                      params: { provider: "avtalegiro", id: String(row.ID) },
                    })
                  }
                />
              ),
            )}
          </TabsContent>
          <TabsContent value="expected" className="flex h-[36rem] flex-col">
            {section(
              expected,
              expected.data?.length === 0 ? (
                <EmptyState
                  title="No claims for this date"
                  description="No AvtaleGiro agreement is charged on this day of the month."
                />
              ) : (
                <DataTable
                  label="Expected AvtaleGiro payments"
                  columns={expectedColumns}
                  data={expected.data}
                  isLoading={expected.isPending}
                  getRowId={(row) => String(row.ID)}
                  getRowHref={(row) => `/agreements/avtalegiro/${row.ID}`}
                  onRowOpen={(row) =>
                    void navigate({
                      to: "/agreements/$provider/$id",
                      params: { provider: "avtalegiro", id: String(row.ID) },
                    })
                  }
                />
              ),
            )}
          </TabsContent>
          <TabsContent value="received" className="flex h-[36rem] flex-col">
            {section(
              received,
              received.data?.length === 0 ? (
                <EmptyState
                  title="Nothing received yet"
                  description="No AvtaleGiro donations are registered for this date. They arrive with the OCR file from the bank."
                />
              ) : (
                <DataTable
                  label="Received AvtaleGiro payments"
                  columns={receivedColumns}
                  data={received.data}
                  isLoading={received.isPending}
                  getRowId={(row) => String(row.id)}
                  getRowHref={(row) => `/donations/${row.id}`}
                  onRowOpen={(row) =>
                    void navigate({ to: `/donations/${row.id}` as LinkProps["to"] })
                  }
                />
              ),
            )}
          </TabsContent>
        </Tabs>
        {/* A footnote to the amounts marked *, below the fixed-height tables, so it coming
            and going with the day moves nothing. */}
        {estimated && (
          <Callout tone="neutral" title="Expected amounts are today's agreement amounts">
            No claim file sent to the bank was found for this date, so Expected uses each
            agreement's current amount (marked *). Agreements changed since then may show a
            difference that wasn't there on the day.
          </Callout>
        )}
      </Updating>
    </DetailPage>
  );
}
