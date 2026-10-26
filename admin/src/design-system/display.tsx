import { HandCoinsIcon, RepeatIcon, UsersIcon, WalletIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BarChart, StackedBarLineChart } from "@/components/charts";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { FileDropzone } from "@/components/domain/file-dropzone";
import { DateTime, Money, Num } from "@/components/domain/format";
import { JsonViewer } from "@/components/domain/json-viewer";
import { KeyInfo, KeyInfoItem } from "@/components/domain/key-info";
import { StatCard } from "@/components/domain/stat-card";
import { StatusBadge } from "@/components/domain/status-badge";
import { Section } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatMoney } from "@/lib/format";
import { localeSettings } from "@/lib/locale";
import { fakeLogEntry, monthlyTotals } from "./fake-data";
import { Specimen, SpecimenGrid } from "./specimen";

const statuses = [
  "ACTIVE",
  "PENDING",
  "DRAFTED",
  "STOPPED",
  "PROCESSED",
  "REFUNDED",
  "FAILED",
  "EXPIRED",
  "DUE",
];

const monthLabel = (month: string) => formatDate(`${month}-01`, "month");

export function BadgesSection() {
  return (
    <Section title="Badges and tabs">
      <SpecimenGrid>
        <Specimen title="Badge variants">
          <Badge>Neutral</Badge>
          <Badge variant="solid">Solid</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="muted">Muted</Badge>
        </Specimen>
        <Specimen title="StatusBadge" description="Maps domain statuses to variants in one place.">
          {statuses.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </Specimen>
        <Specimen
          title="Tabs"
          description="Underline style with counters."
          className="lg:col-span-2"
          bodyClassName="block"
        >
          <Tabs defaultValue="donations">
            <TabsList>
              <TabsTrigger value="donations" count={128}>
                Donations
              </TabsTrigger>
              <TabsTrigger value="distributions" count={4}>
                Distributions
              </TabsTrigger>
              <TabsTrigger value="avtalegiro" count={1}>
                AvtaleGiro
              </TabsTrigger>
              <TabsTrigger value="vipps" count={0}>
                Vipps
              </TabsTrigger>
              <TabsTrigger value="tax" count={2}>
                Tax units
              </TabsTrigger>
              <TabsTrigger value="disabled" disabled>
                Referrals
              </TabsTrigger>
            </TabsList>
            <TabsContent value="donations" className="text-sm text-muted-foreground">
              Donations tab content.
            </TabsContent>
            <TabsContent value="distributions" className="text-sm text-muted-foreground">
              Distributions tab content.
            </TabsContent>
            <TabsContent value="avtalegiro" className="text-sm text-muted-foreground">
              AvtaleGiro tab content.
            </TabsContent>
            <TabsContent value="vipps" className="text-sm text-muted-foreground">
              Vipps tab content.
            </TabsContent>
            <TabsContent value="tax" className="text-sm text-muted-foreground">
              Tax units tab content.
            </TabsContent>
          </Tabs>
        </Specimen>
      </SpecimenGrid>
    </Section>
  );
}

export function DataDisplaySection() {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <Section
      title="Data display"
      description="Money, numbers and dates format by VITE_LOCALE; numbers are always tabular."
    >
      <div className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Donations this month"
            value={<Money value={1_284_310} />}
            delta={0.124}
            deltaLabel="vs. September"
            icon={HandCoinsIcon}
          />
          <StatCard
            label="Donors"
            value={<Num value={3_412} />}
            delta={-0.031}
            deltaLabel="vs. September"
            icon={UsersIcon}
          />
          <StatCard
            label="Active agreements"
            value={<Num value={1_907} />}
            footer="AvtaleGiro + Vipps"
            icon={RepeatIcon}
          />
          <StatCard
            label="Median donation"
            value={<Money value={500} />}
            footer="Last 30 days"
            icon={WalletIcon}
          />
        </div>

        <SpecimenGrid>
          <Specimen title="Formatting" bodyClassName="block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 label-caps text-muted-foreground">Component</th>
                  <th className="pb-2 text-right label-caps text-muted-foreground">
                    Active locale
                  </th>
                  <th className="pb-2 text-right label-caps text-muted-foreground">NO · SV</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-border [&_td]:py-1.5">
                <tr>
                  <td>Money</td>
                  <td className="text-right">
                    <Money value={1_234_567} />
                  </td>
                  <td className="num text-right text-muted-foreground">
                    {formatMoney(1_234_567, { settings: localeSettings.NO })} ·{" "}
                    {formatMoney(1_234_567, { settings: localeSettings.SV })}
                  </td>
                </tr>
                <tr>
                  <td>Money, decimals, signed</td>
                  <td className="text-right">
                    <Money value={-249.5} decimals={2} signed />
                  </td>
                  <td />
                </tr>
                <tr>
                  <td>Num / percent</td>
                  <td className="text-right">
                    <Num value={48213} /> · <Num value={0.0275} percent />
                  </td>
                  <td />
                </tr>
                <tr>
                  <td>DateTime</td>
                  <td className="text-right">
                    <DateTime value="2026-10-24T05:00:12Z" format="datetime" />
                  </td>
                  <td className="num text-right text-muted-foreground">
                    {formatDate("2026-10-24", "date", localeSettings.NO)} ·{" "}
                    {formatDate("2026-10-24", "date", localeSettings.SV)}
                  </td>
                </tr>
                <tr>
                  <td>Relative</td>
                  <td className="text-right">
                    <DateTime value="2026-10-20T08:00:00Z" format="relative" />
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </Specimen>

          <Specimen
            title="KeyInfo"
            description="Label/value grid. Hover a value with a pencil to edit inline; Enter saves, Esc cancels."
            bodyClassName="block"
          >
            <KeyInfo columns={2}>
              <KeyInfoItem
                label="Name"
                edit={{
                  value: "Ingrid Hansen",
                  onSave: (v) => void toast.success(`Saved name: ${v}`),
                }}
              />
              <KeyInfoItem
                label="Email"
                edit={{
                  value: "ingrid.hansen@example.org",
                  type: "email",
                  validate: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
                  onSave: () => new Promise((resolve) => setTimeout(resolve, 500)),
                }}
              />
              <KeyInfoItem label="Total donated">
                <Money value={84_250} />
              </KeyInfoItem>
              <KeyInfoItem label="Registered">
                <DateTime value="2019-03-14" />
              </KeyInfoItem>
              <KeyInfoItem label="Status">
                <StatusBadge status="ACTIVE" />
              </KeyInfoItem>
              <KeyInfoItem label="Tax unit" />
            </KeyInfo>
          </Specimen>
        </SpecimenGrid>

        <SpecimenGrid>
          <Card>
            <CardHeader>
              <CardTitle>Donations per month</CardTitle>
              <CardDescription>Bar chart · money</CardDescription>
              <CardAction>
                <Badge variant="outline">12 months</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <BarChart
                data={monthlyTotals}
                xKey="month"
                series={[{ key: "total", label: "Total" }]}
                format="money"
                xFormatter={monthLabel}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>By cause area, with donors</CardTitle>
              <CardDescription>Stacked bars + line on a secondary axis</CardDescription>
            </CardHeader>
            <CardContent>
              <StackedBarLineChart
                data={monthlyTotals}
                xKey="month"
                bars={[
                  { key: "health", label: "Global health" },
                  { key: "animals", label: "Animal welfare", color: "chart-3" },
                  { key: "climate", label: "Climate", color: "chart-4" },
                ]}
                line={{ key: "donors", label: "Donors", color: "chart-2" }}
                xFormatter={monthLabel}
              />
            </CardContent>
          </Card>
        </SpecimenGrid>

        <SpecimenGrid>
          <Specimen
            title="JsonViewer"
            description="For log entries. Collapsible, copyable."
            bodyClassName="block p-0 border-0"
          >
            <JsonViewer data={fakeLogEntry} />
          </Specimen>
          <Specimen
            title="FileDropzone"
            description="For report uploads (OCR, bank, Vipps…)."
            bodyClassName="grid gap-3 border-0 p-0"
          >
            <FileDropzone
              files={files}
              onFilesChange={setFiles}
              accept=".txt,.csv,.xml"
              hint="OCR .txt, bank .csv or KU65 .xml · max 10 MB"
            />
            <div className="flex justify-end">
              <Button
                disabled={files.length === 0}
                onClick={() => toast.success(`Uploaded ${files[0]?.name}`)}
              >
                Upload report
              </Button>
            </div>
          </Specimen>
        </SpecimenGrid>
      </div>
    </Section>
  );
}

export function FeedbackSection() {
  return (
    <Section title="Loading, empty and error states">
      <div className="grid gap-6 lg:grid-cols-3">
        <Specimen title="Skeleton" bodyClassName="grid gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </Specimen>
        <Specimen title="EmptyState" bodyClassName="block p-0">
          <EmptyState
            title="No agreements"
            description="This donor has no AvtaleGiro or Vipps agreements."
            action={
              <Button variant="outline" size="sm">
                Create agreement
              </Button>
            }
            compact
          />
        </Specimen>
        <Specimen title="ErrorState" bodyClassName="grid gap-3 border-0 p-0">
          <ErrorState
            error={new Error("Failed to fetch")}
            onRetry={() => toast.info("Retrying…")}
          />
          <ErrorState
            error={new Error("Donor 1042 has active agreements")}
            title="Could not merge donors"
          />
        </Specimen>
      </div>
    </Section>
  );
}
