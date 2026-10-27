import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { addDays, parseISO } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { createColumns, DataTable } from "@/components/data-table";
import { CopyValue } from "@/components/domain/copy-value";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Status } from "@/components/domain/status";
import { DetailPage, DetailPanel } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useTRPC } from "@/lib/trpc";

const tabs = ["missing", "expected", "received"] as const;
type Tab = (typeof tabs)[number];

export const Route = createFileRoute("/_app/avtalegiro-check")({
  validateSearch: (raw: Record<string, unknown>): { date?: string; tab?: Tab } => ({
    date: typeof raw.date === "string" ? raw.date : undefined,
    tab: tabs.includes(raw.tab as Tab) ? (raw.tab as Tab) : undefined,
  }),
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
    meta: { cellClassName: "max-w-56 truncate" },
    cell: ({ row, getValue }) =>
      agreementLink(row.original.ID, getValue() || `#${row.original.ID}`),
  }),
  missingCol.accessor("email", { header: "Email", meta: { cellClassName: "max-w-64 truncate" } }),
  missingCol.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  missingCol.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  missingCol.accessor("cancelled", {
    header: "Cancelled",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

const expectedCol = createColumns<ExpectedRow>();
const expectedColumns = expectedCol.columns([
  expectedCol.accessor("ID", {
    header: "Agreement",
    cell: ({ getValue }) => agreementLink(getValue(), `#${getValue()}`),
  }),
  expectedCol.accessor("amount", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  expectedCol.accessor("KID", {
    header: "KID",
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
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
]);

const receivedCol = createColumns<ReceivedRow>();
const receivedColumns = receivedCol.columns([
  receivedCol.accessor("id", {
    header: "Donation",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-24" },
  }),
  receivedCol.accessor("donor", { header: "Donor", meta: { cellClassName: "font-semibold" } }),
  receivedCol.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  receivedCol.accessor("kid", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  receivedCol.accessor("timestamp", {
    header: "Registered for",
    cell: ({ getValue }) => <DateTime value={getValue() as string} />,
  }),
]);

function AvtaleGiroCheckPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [today] = useState(() => new Date());
  const date = checkDate(search.date, today);
  const tab: Tab = search.tab ?? "missing";

  const expected = useQuery(trpc.giro.avtalegiro.expected.queryOptions({ date }));
  const received = useQuery(trpc.giro.avtalegiro.received.queryOptions({ date }));
  const missing = useQuery(trpc.giro.avtalegiro.missing.queryOptions({ date }));
  const validation = useQuery(trpc.giro.avtalegiro.validation.queryOptions());

  const setDate = (next: string) =>
    void navigate({
      to: "/avtalegiro-check",
      search: (prev) => ({ ...prev, date: next === isoDay(today) ? undefined : next }),
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
          {date !== isoDay(today) && <Button onClick={() => setDate(isoDay(today))}>Today</Button>}
        </div>
      }
      stats={
        <StatGroup>
          <Stat
            label="Expected"
            value={
              summary ? <Money value={summary.expectedSum} /> : <Skeleton className="h-7 w-20" />
            }
            hint={
              summary && (
                <>
                  <Num value={summary.expectedCount} /> agreements
                </>
              )
            }
          />
          <Stat
            label="Received"
            value={
              summary ? <Money value={summary.receivedSum} /> : <Skeleton className="h-7 w-20" />
            }
            hint={
              summary && (
                <>
                  <Num value={summary.receivedCount} /> donations
                </>
              )
            }
          />
          <Stat
            label="Missing"
            value={
              summary ? (
                <span className={summary.missingCount > 0 ? "text-danger" : undefined}>
                  <Money value={summary.missingSum} />
                </span>
              ) : (
                <Skeleton className="h-7 w-20" />
              )
            }
            hint={
              summary && (
                <>
                  <Num value={summary.missingCount} /> agreements without a donation
                </>
              )
            }
          />
        </StatGroup>
      }
      aside={
        <DetailPanel title="Last month by charge day">
          {validation.isError ? (
            <div className="py-3">
              <ErrorState error={validation.error} onRetry={() => void validation.refetch()} />
            </div>
          ) : !validation.data ? (
            <div className="py-3">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : validation.data.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No AvtaleGiro agreements to check.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">
                Expected and received AvtaleGiro payments per charge day over the last month
              </caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-normal">
                    Date
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Expected
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Received
                  </th>
                  <th scope="col" className="py-2 pl-3 font-normal">
                    <span className="sr-only">Status</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {validation.data.map((row) => {
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
                      <td className="py-1.5 text-right">
                        <Money value={row.expected} />
                      </td>
                      <td className="py-1.5 text-right">
                        <Money value={row.actual} />
                      </td>
                      <td className="py-1.5 pl-3">
                        <Status catalog={avtaleGiroDayStatus} value={validationState(row)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </DetailPanel>
      }
    >
      <Tabs
        value={tab}
        onValueChange={(value) =>
          void navigate({
            to: "/avtalegiro-check",
            search: (prev) => ({ ...prev, tab: value === "missing" ? undefined : (value as Tab) }),
          })
        }
      >
        <TabsList>
          <TabsTrigger value="missing" count={missing.data?.length}>
            Missing
          </TabsTrigger>
          <TabsTrigger value="expected" count={expected.data?.length}>
            Expected
          </TabsTrigger>
          <TabsTrigger value="received" count={received.data?.length}>
            Received
          </TabsTrigger>
        </TabsList>
        <TabsContent value="missing" className="flex max-h-[36rem] flex-col">
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
        <TabsContent value="expected" className="flex max-h-[36rem] flex-col">
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
        <TabsContent value="received" className="flex max-h-[36rem] flex-col">
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
    </DetailPage>
  );
}
