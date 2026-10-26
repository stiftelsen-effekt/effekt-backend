import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  CalendarIcon,
  EllipsisIcon,
  HandCoinsIcon,
  MailIcon,
  MergeIcon,
  RepeatIcon,
  Trash2Icon,
  WalletIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { StackedBarLineChart } from "@/components/charts";
import { createColumns, DataTable, type SortingState } from "@/components/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { EmptyState } from "@/components/domain/empty-state";
import { DateTime, Money } from "@/components/domain/format";
import { JsonViewer } from "@/components/domain/json-viewer";
import { KeyInfo, KeyInfoGroup, KeyInfoItem } from "@/components/domain/key-info";
import { StatCard } from "@/components/domain/stat-card";
import { StatusBadge } from "@/components/domain/status-badge";
import { Page, PageHeader, Section } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  donorYearly,
  fakeDonations,
  fakeLogEntry,
  type FakeDonation,
} from "@/design-system/fake-data";

export const Route = createFileRoute("/design/detail")({
  validateSearch: z.object({ id: z.number().int().optional().catch(undefined) }),
  component: DonorDemo,
});

const col = createColumns<FakeDonation>();
const donationColumns = col.columns([
  col.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground" },
  }),
  col.accessor("timestamp", {
    header: "Date",
    meta: { numeric: true },
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  col.accessor("method", { header: "Method" }),
  col.accessor("amount", {
    header: "Sum",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  col.accessor("kid", {
    header: "KID",
    enableSorting: false,
    meta: { cellClassName: "num text-muted-foreground" },
  }),
  col.accessor("status", {
    header: "Status",
    enableSorting: false,
    cell: ({ getValue }) => <StatusBadge status={getValue()} />,
  }),
]);

const agreements = [
  {
    id: "AG-2291",
    type: "AvtaleGiro",
    amount: 500,
    day: 15,
    status: "ACTIVE",
    created: "2021-02-03",
  },
  { id: "VP-88a1", type: "Vipps", amount: 200, day: 1, status: "STOPPED", created: "2019-11-20" },
  {
    id: "AG-3307",
    type: "AvtaleGiro",
    amount: 1000,
    day: 20,
    status: "PENDING",
    created: "2026-10-21",
  },
];

function DonorDemo() {
  const { id = 1042 } = Route.useSearch();
  const [sorting, setSorting] = useState<SortingState>([{ id: "timestamp", desc: true }]);

  const donations = useMemo(() => {
    const own = fakeDonations.filter((d) => d.donorId === id);
    const rows = own.length ? own : fakeDonations.slice(0, 9);
    const sort = sorting[0];
    if (!sort) return rows;
    const key = sort.id as keyof FakeDonation;
    const dir = sort.desc ? -1 : 1;
    return [...rows].sort((a, b) => (a[key] < b[key] ? -dir : a[key] > b[key] ? dir : 0));
  }, [id, sorting]);

  const donor = donations[0]!;
  const total = donorYearly.reduce((sum, y) => sum + y.health + y.animals + y.climate, 0);

  return (
    <Page>
      <div className="-mb-4">
        <Button variant="link" size="sm" asChild className="text-muted-foreground">
          <Link to="/design/list">
            <ArrowLeftIcon />
            Donations
          </Link>
        </Button>
      </div>
      <PageHeader
        eyebrow={<span className="num">Donor #{id}</span>}
        title={donor.donor}
        subtitle={donor.email}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => toast.success("Receipt sent", { description: donor.email })}
            >
              <MailIcon />
              Resend receipt
            </Button>
            <Button variant="outline">
              <MergeIcon />
              Merge
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Copy donor ID</DropdownMenuItem>
                <DropdownMenuItem>Open in Auth0</DropdownMenuItem>
                <DropdownMenuSeparator />
                <ConfirmDialog
                  destructive
                  title={`Delete ${donor.donor}?`}
                  description="Donors with donations can't be deleted. Merge them instead."
                  confirmLabel="Delete donor"
                  onConfirm={() =>
                    void toast.error("Donor has donations", { description: "Merge instead." })
                  }
                  trigger={
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(event) => event.preventDefault()}
                    >
                      <Trash2Icon />
                      Delete donor
                    </DropdownMenuItem>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total donated"
          value={<Money value={total} />}
          icon={HandCoinsIcon}
          footer="Since 2019"
        />
        <StatCard
          label="This year"
          value={<Money value={21_850} />}
          delta={0.18}
          deltaLabel="vs. 2025"
          icon={CalendarIcon}
        />
        <StatCard
          label="Donations"
          value={<span className="num">{donations.length}</span>}
          icon={WalletIcon}
        />
        <StatCard
          label="Active agreements"
          value="1"
          icon={RepeatIcon}
          footer={<StatusBadge status="ACTIVE" label="AvtaleGiro" />}
        />
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Section title="Key info">
          <KeyInfo columns={2} className="gap-y-6">
            <KeyInfoGroup title="Contact">
              <KeyInfoItem
                label="Name"
                edit={{ value: donor.donor, onSave: (v) => void toast.success(`Name saved: ${v}`) }}
              />
              <KeyInfoItem
                label="Email"
                edit={{
                  value: donor.email,
                  type: "email",
                  validate: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
                  onSave: () => new Promise((r) => setTimeout(r, 400)),
                }}
              />
              <KeyInfoItem label="Newsletter">
                <Badge variant="success" dot>
                  Subscribed
                </Badge>
              </KeyInfoItem>
            </KeyInfoGroup>
            <KeyInfoGroup title="Account">
              <KeyInfoItem label="Registered">
                <DateTime value="2019-03-14T10:22:00Z" format="datetime" />
              </KeyInfoItem>
              <KeyInfoItem label="Last donation">
                <DateTime value={donor.timestamp} format="relative" />
              </KeyInfoItem>
              <KeyInfoItem label="Referral">Podcast</KeyInfoItem>
            </KeyInfoGroup>
            <KeyInfoGroup title="Tax">
              <KeyInfoItem label="Tax unit">{donor.donor}</KeyInfoItem>
              <KeyInfoItem label="National ID">
                <span className="num">•••••••4821</span>
              </KeyInfoItem>
            </KeyInfoGroup>
            <KeyInfoGroup title="Distribution">
              <KeyInfoItem label="Standard split">
                <Badge variant="outline">Smart distribution</Badge>
              </KeyInfoItem>
              <KeyInfoItem label="KID">
                <span className="num">{donor.kid}</span>
              </KeyInfoItem>
            </KeyInfoGroup>
          </KeyInfo>
        </Section>
        <Section
          title="Donations per year"
          description="Stacked by cause area; line is number of donations."
        >
          <StackedBarLineChart
            data={donorYearly}
            xKey="year"
            bars={[
              { key: "health", label: "Global health" },
              { key: "animals", label: "Animal welfare", color: "chart-3" },
              { key: "climate", label: "Climate", color: "chart-4" },
            ]}
            line={{ key: "donations", label: "Donations", color: "chart-2" }}
          />
        </Section>
      </div>

      <Tabs defaultValue="donations">
        <TabsList>
          <TabsTrigger value="donations" count={donations.length}>
            Donations
          </TabsTrigger>
          <TabsTrigger value="agreements" count={agreements.length}>
            Agreements
          </TabsTrigger>
          <TabsTrigger value="tax" count={0}>
            Tax units
          </TabsTrigger>
          <TabsTrigger value="log" count={1}>
            Log
          </TabsTrigger>
        </TabsList>
        <TabsContent value="donations">
          <DataTable
            columns={donationColumns}
            data={donations}
            getRowId={(row) => String(row.id)}
            sorting={sorting}
            onSortingChange={setSorting}
            onRowClick={(row) => toast.info(`Open donation #${row.id}`)}
            scrollClassName="max-h-none"
          />
        </TabsContent>
        <TabsContent value="agreements">
          <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
            {agreements.map((agreement) => (
              <div key={agreement.id} className="grid gap-2 bg-background p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{agreement.type}</span>
                  <StatusBadge status={agreement.status} />
                </div>
                <Money value={agreement.amount} className="text-xl font-semibold" />
                <p className="text-xs text-muted-foreground">
                  Day <span className="num">{agreement.day}</span> each month · since{" "}
                  <DateTime value={agreement.created} />
                </p>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="tax">
          <EmptyState
            title="No tax units"
            description="Add one to report donations for tax deduction."
            action={<Button size="sm">Add tax unit</Button>}
            compact
          />
        </TabsContent>
        <TabsContent value="log">
          <JsonViewer data={fakeLogEntry} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
