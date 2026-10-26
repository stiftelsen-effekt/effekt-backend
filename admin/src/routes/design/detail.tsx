import { createFileRoute } from "@tanstack/react-router";
import { FlagIcon, GitMergeIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { BarChart } from "@/components/charts";
import { createColumns, DataTable } from "@/components/data-table";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionSummary } from "@/components/domain/distribution-editor";
import { DateTime, Money, Num } from "@/components/domain/format";
import { InlineEdit } from "@/components/domain/inline-edit";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Status } from "@/components/domain/status";
import { DetailPage, DetailPanel, PageSection } from "@/components/templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  avtaleGiroDetail,
  causeAreas,
  donor as fakeDonor,
  donorDistributions,
  donorDonations,
  donorTaxUnits,
  donorYearly,
  vippsAgreements,
  type DonorDistribution,
  type DonorDonation,
} from "@/design-system/fake-data";
import {
  fromAvtaleGiro,
  fromVipps,
  agreementTypes,
  type AgreementRow,
} from "@/features/agreements/model";
import { draftFromApi } from "@/features/distribution/model";
import { notify } from "@/lib/notify";
import { agreementStatus } from "@/lib/status";

export const Route = createFileRoute("/design/detail")({
  component: DonorDemo,
});

const donationCol = createColumns<DonorDonation>();
const donationColumns = donationCol.columns([
  donationCol.accessor("id", {
    header: "ID",
    meta: { numeric: true, cellClassName: "text-muted-foreground w-20" },
  }),
  donationCol.accessor("timestamp", {
    header: "Date",
    cell: ({ getValue }) => <DateTime value={getValue()} />,
  }),
  donationCol.accessor("paymentMethod", { header: "Method" }),
  donationCol.accessor("sum", {
    header: "Amount",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  donationCol.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
]);

const agreementCol = createColumns<AgreementRow>();
const agreementColumns = agreementCol.columns([
  agreementCol.accessor("type", {
    header: "Type",
    cell: ({ getValue }) => agreementTypes[getValue()].label,
  }),
  agreementCol.accessor("status", {
    header: "Status",
    cell: ({ getValue }) => <Status catalog={agreementStatus} value={getValue()} />,
  }),
  agreementCol.accessor("amount", {
    header: "Monthly",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
  agreementCol.accessor("chargeDay", { header: "Charge day", meta: { numeric: true } }),
  agreementCol.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
]);

const distributionCol = createColumns<DonorDistribution>();
const distributionColumns = distributionCol.columns([
  distributionCol.accessor("KID", {
    header: "KID",
    cell: ({ getValue }) => <CopyValue value={getValue()} label="KID" />,
  }),
  distributionCol.accessor("count", { header: "Donations", meta: { numeric: true } }),
  distributionCol.accessor("sum", {
    header: "Total",
    meta: { numeric: true, cellClassName: "font-semibold" },
    cell: ({ getValue }) => <Money value={getValue()} />,
  }),
]);

const agreements: AgreementRow[] = [
  fromAvtaleGiro({
    ...avtaleGiroDetail,
    notice: "1",
    last_updated: avtaleGiroDetail.last_updated ?? "",
    created: avtaleGiroDetail.created ?? "",
    full_name: fakeDonor.name,
  }),
  { ...fromVipps({ ...vippsAgreements[3]!, full_name: fakeDonor.name }), status: "stopped" },
];

function DonorDemo() {
  const [donor, setDonor] = useState(fakeDonor);
  const total = donorDonations.reduce((sum, d) => sum + Number(d.sum), 0);
  const yearly = useMemo(() => {
    const years = [...new Set(donorYearly.map((row) => row.year))];
    return years.map((year) => {
      const rows = donorYearly.filter((row) => row.year === year);
      const by = (id: number) =>
        rows.filter((r) => r.causeAreaID === id).reduce((s, r) => s + Number(r.value), 0);
      return { year: String(year), health: by(1), animals: by(2), climate: by(3) };
    });
  }, []);
  const thisYear = yearly.at(-1)!;
  const lastYear = yearly.at(-2)!;
  const sumYear = (row: typeof thisYear) => row.health + row.animals + row.climate;
  const distribution = useMemo(() => draftFromApi(causeAreas, avtaleGiroDetail.distribution), []);

  const save = (patch: Partial<typeof donor>) => async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    setDonor((current) => ({ ...current, ...patch }));
    notify.success("Donor updated");
  };

  return (
    <DetailPage
      breadcrumbs={[{ label: "Donors", to: "/design/list" }]}
      title={donor.name}
      meta={[
        <CopyValue key="id" value={donor.id} prefix="#" label="donor ID" />,
        donor.email,
        <span key="since">
          Donor since <DateTime value={donor.registered} format="month" />
        </span>,
      ]}
      actions={
        <>
          <Button onClick={() => notify.success("Fundraiser created")}>
            <FlagIcon />
            Create fundraiser
          </Button>
          <ConfirmDialog
            title="Merge Elias Olsen into another donor?"
            description="Pick the donor to keep. Everything moves there."
            consequences={[
              "23 donations, 2 agreements, 1 tax unit and 2 KIDs move to the donor you keep.",
              <>
                Donor <strong>#{donor.id}</strong> is deleted. This can't be undone.
              </>,
            ]}
            confirmLabel="Merge donors"
            tone="danger"
            confirmText={String(donor.id)}
            onConfirm={async () => {
              await new Promise((resolve) => setTimeout(resolve, 600));
              throw new Error("Demo: merging is disabled on /design.");
            }}
            trigger={
              <Button>
                <GitMergeIcon />
                Merge…
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" aria-label="More actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="danger">
                <Trash2Icon />
                Move to trash
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      stats={
        <StatGroup>
          <Stat
            label="Given in total"
            value={<Money value={total} />}
            hint={
              <>
                <Num value={donorDonations.length} /> donations
              </>
            }
          />
          <Stat
            label="This year"
            value={<Money value={sumYear(thisYear)} />}
            delta={sumYear(thisYear) / sumYear(lastYear) - 1}
            deltaLabel={`vs. ${lastYear.year}`}
          />
          <Stat
            label="Excluding operations"
            value={<Money value={total * 0.95} />}
            hint="5 % to operations"
          />
          <Stat label="Active agreements" value={1} hint="AvtaleGiro 500 kr / month" />
        </StatGroup>
      }
      aside={
        <>
          <DetailPanel title="Contact">
            <PropertyList labelWidth="6.5rem">
              <Property label="Name">
                <InlineEdit label="Name" value={donor.name} onSave={(name) => save({ name })()} />
              </Property>
              <Property label="Email">
                <InlineEdit
                  label="Email"
                  type="email"
                  value={donor.email}
                  validate={(value) =>
                    /^\S+@\S+\.\S+$/.test(value) ? null : "Enter a valid email address"
                  }
                  onSave={async (email) => {
                    if (email.endsWith("@taken.org"))
                      throw new Error("Email already belongs to another donor");
                    await save({ email })();
                  }}
                />
              </Property>
              <Property label="Newsletter">
                <label className="inline-flex items-center gap-2">
                  <Switch
                    checked={donor.newsletter}
                    onCheckedChange={(newsletter) => {
                      setDonor((current) => ({ ...current, newsletter }));
                      notify.undo(
                        newsletter ? "Subscribed to newsletter" : "Unsubscribed from newsletter",
                        () => setDonor((current) => ({ ...current, newsletter: !newsletter })),
                      );
                    }}
                  />
                  {donor.newsletter ? "Subscribed" : "Not subscribed"}
                </label>
              </Property>
              <Property label="Registered">
                <DateTime value={donor.registered} format="datetime" />
              </Property>
              <Property label="Heard via">Podcast</Property>
            </PropertyList>
          </DetailPanel>
          <DetailPanel
            title="Tax units"
            actions={
              <Button size="sm" variant="ghost">
                Add
              </Button>
            }
          >
            <PropertyList labelWidth="6.5rem">
              {donorTaxUnits.map((unit) => (
                <Property key={unit.id} label={unit.name} hint={`${unit.numDonations} donations`}>
                  <span className="num">{unit.ssn?.replace(/^(\d{6})\d+/, "$1 •••••")}</span>
                </Property>
              ))}
            </PropertyList>
          </DetailPanel>
          <DetailPanel title="Usual distribution">
            <div className="py-3">
              <DistributionSummary draft={distribution} config={causeAreas} />
            </div>
          </DetailPanel>
        </>
      }
    >
      <PageSection title="Given per year" description="By cause area">
        <BarChart
          data={yearly}
          xKey="year"
          stacked
          format="money"
          series={[
            { key: "health", label: "Global health" },
            { key: "animals", label: "Animal welfare" },
            { key: "climate", label: "Climate" },
          ]}
          className="h-56"
        />
      </PageSection>
      <Tabs defaultValue="donations">
        <TabsList>
          <TabsTrigger value="donations" count={donorDonations.length}>
            Donations
          </TabsTrigger>
          <TabsTrigger value="agreements" count={agreements.length}>
            Agreements
          </TabsTrigger>
          <TabsTrigger value="kids" count={donorDistributions.length}>
            KIDs
          </TabsTrigger>
          <TabsTrigger value="tax">
            Tax deductions <Badge tone="neutral">2025</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="donations" className="flex max-h-[32rem] flex-col">
          <DataTable
            label="Donations by this donor"
            columns={donationColumns}
            data={donorDonations}
            getRowId={(row) => String(row.id)}
            onRowOpen={() => notify.info("Opens the donation page")}
          />
        </TabsContent>
        <TabsContent value="agreements" className="flex flex-col">
          <DataTable
            label="Agreements"
            columns={agreementColumns}
            data={agreements}
            getRowId={(row) => row.key}
            onRowOpen={() => notify.info("Opens the agreement page")}
          />
        </TabsContent>
        <TabsContent value="kids" className="flex flex-col">
          <DataTable
            label="KIDs"
            columns={distributionColumns}
            data={donorDistributions}
            getRowId={(row) => row.KID}
          />
        </TabsContent>
        <TabsContent value="tax">
          <PropertyList>
            {donorTaxUnits[0]!.taxDeductions!.map((row) => (
              <Property key={row.year} label={String(row.year)} hint={`Benefit ${row.benefit} kr`}>
                <Money value={row.deduction} className="font-semibold" /> deducted of{" "}
                <Money value={row.sumDonations} />
              </Property>
            ))}
          </PropertyList>
        </TabsContent>
      </Tabs>
    </DetailPage>
  );
}
