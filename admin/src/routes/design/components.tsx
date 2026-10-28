import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownToLineIcon,
  BuildingIcon,
  CalendarCheckIcon,
  InboxIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SmartphoneIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { AttentionList } from "@/components/domain/attention-list";
import { Callout } from "@/components/domain/callout";
import { ConfirmDialog } from "@/components/domain/confirm-dialog";
import { JsonViewer } from "@/components/domain/json-viewer";
import { CopyValue } from "@/components/domain/copy-value";
import { DistributionEditor, DistributionSummary } from "@/components/domain/distribution-editor";
import { OrgSparkline } from "@/components/domain/org-split";
import { orgSlices } from "@/features/distribution/orgs";
import { EmptyState } from "@/components/domain/empty-state";
import { ErrorState } from "@/components/domain/error-state";
import { DateTime, Money, Num } from "@/components/domain/format";
import { InlineEdit } from "@/components/domain/inline-edit";
import { Property, PropertyList } from "@/components/domain/property-list";
import { Stat, StatGroup } from "@/components/domain/stat";
import { Status } from "@/components/domain/status";
import {
  binValues,
  BooleanFilter,
  ChoiceFilter,
  DateRangeFilter,
  defineList,
  FilterBar,
  OptionsFilter,
  param,
  RangeFilter,
  SavedViews,
  TextFilter,
  useListState,
} from "@/components/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceCards } from "@/components/ui/choice-cards";
import { Combobox } from "@/components/ui/combobox";
import { DateInput } from "@/components/ui/date-input";
import { DateRangePicker, type DateRange } from "@/components/ui/date-range-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonText } from "@/components/ui/skeleton";
import { LoadingDemo } from "@/design-system/loading-demo";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  avtaleGiroDetail,
  causeAreas,
  donationAmountEdges,
  donations,
  donors,
  paymentMethods,
  mixedDistribution,
} from "@/design-system/fake-data";
import { DocPage, DocSection, Example } from "@/design-system/doc";
import { fakeDonorSearch } from "@/design-system/fake-search";
import { DonorPicker, type PickedDonor } from "@/features/donors/donor-picker";
import { draftFromApi, standardDraft } from "@/features/distribution/model";
import { moneyToNumber } from "@/lib/money";
import { notify } from "@/lib/notify";
import { agreementStatus, chargeStatus, importStatus } from "@/lib/status";

const demoList = defineList({
  id: "design-components",
  filters: {
    q: param.text,
    amount: param.range,
    date: param.dateRange,
    method: param.numberList,
    newsletter: param.boolean,
    fundraiser: param.oneOf(["atLeastOnce", "only", "never"]),
    kid: param.text,
  },
  sortable: ["id"],
  defaultSort: { id: "id", desc: true },
});

export const Route = createFileRoute("/design/components")({
  validateSearch: demoList.validateSearch,
  component: Components,
});

const bins = binValues(
  donations.map((d) => moneyToNumber(d.sum)),
  donationAmountEdges,
);

function Components() {
  const list = useListState(demoList);
  const [distribution, setDistribution] = useState(() => standardDraft(causeAreas));
  const [mode, setMode] = useState<"kid" | "distribution">("kid");
  const [source, setSource] = useState<string | undefined>("ocr");
  const [name, setName] = useState("Elias Olsen");
  const [owner, setOwner] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange | undefined>();
  const [day, setDay] = useState("2026-10-24");
  const [pickedDonor, setPickedDonor] = useState<PickedDonor | null>(() => {
    const { id, name, email } = donors[4]!;
    return { id, name, email };
  });

  return (
    <DocPage
      title="Components"
      intro={
        <>
          Every component in each state, with the rule for when to use it. Props are named the same
          everywhere: <code className="font-mono text-sm">variant</code> for visual weight,{" "}
          <code className="font-mono text-sm">tone</code> for meaning,{" "}
          <code className="font-mono text-sm">size</code> sm/md/lg,{" "}
          <code className="font-mono text-sm">label</code> for the accessible name,{" "}
          <code className="font-mono text-sm">value</code>/
          <code className="font-mono text-sm">onChange</code>.
        </>
      }
    >
      <DocSection
        id="buttons"
        title="Buttons"
        description="Variant expresses importance. One primary per view. The button label is the verb and, for money, the amount."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Example
            title="Variants"
            use="primary: the main action · secondary: everything else · ghost: toolbars and rows · danger: only to confirm something irreversible"
          >
            <Button variant="primary">Register 500 kr</Button>
            <Button>Export CSV</Button>
            <Button variant="ghost">Clear all</Button>
            <Button variant="danger">Delete donation</Button>
            <Button variant="link">View log</Button>
          </Example>
          <Example
            title="Sizes and states"
            use="pending shows a spinner, keeps the width and blocks double submits."
          >
            <Button size="sm">Small</Button>
            <Button>Medium</Button>
            <Button size="lg">Large</Button>
            <Button variant="primary" pending>
              Saving
            </Button>
            <Button disabled>Disabled</Button>
            <Button size="icon" aria-label="Edit">
              <PencilIcon />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="More">
              <MoreHorizontalIcon />
            </Button>
          </Example>
        </div>
      </DocSection>

      <DocSection
        id="inputs"
        title="Form controls"
        description="All text-like controls share one outline, height (density-aware) and focus ring. Wrap each in Field for label, hint and error."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Example title="Field states" surfaceClassName="grid gap-4 sm:grid-cols-2">
            <Field label="Email" hint="Receipts go here.">
              <Input defaultValue="kari@example.org" type="email" />
            </Field>
            <Field label="KID" error="Enter a KID of 5–15 digits">
              <Input defaultValue="12ab" className="num" />
            </Field>
            <Field label="Disabled">
              <Input value="Locked after export" disabled readOnly />
            </Field>
            <Field label="Payment method">
              <Select defaultValue="4">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Organization" hint="Combobox: searchable single choice from a long list.">
              <Combobox
                value={owner}
                onValueChange={setOwner}
                placeholder="Choose organization"
                options={causeAreas.flatMap((area) =>
                  area.organizations.map((org) => ({
                    value: String(org.id),
                    label: org.name,
                    hint: area.name,
                  })),
                )}
              />
            </Field>
            <Field
              label="Period"
              hint="DateRangePicker: for forms and reports; lists use the date filter chip."
            >
              <DateRangePicker value={range} onValueChange={setRange} />
            </Field>
            <Field label="Payment date" hint="DateInput: one day, typed as dd.mm.yyyy or picked.">
              <DateInput value={day} onValueChange={setDay} />
            </Field>
            <Field label="Note" className="sm:col-span-2">
              <Textarea placeholder="Visible to the team only" />
            </Field>
          </Example>
          <div className="grid gap-4">
            <Example
              title="Choices"
              use="Checkbox for independent options, Switch for settings that apply immediately, SegmentedControl for 2–4 modes."
            >
              <label className="flex items-center gap-2 text-sm">
                <Checkbox defaultChecked /> Send receipt
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked="indeterminate" /> Some selected
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch defaultChecked /> Newsletter
              </label>
              <SegmentedControl
                label="Register on"
                value={mode}
                onValueChange={setMode}
                options={[
                  { value: "kid", label: "Existing KID" },
                  { value: "distribution", label: "New distribution" },
                ]}
              />
            </Example>
            <Example title="Choice cards" use="A single choice where each option needs a sentence.">
              <ChoiceCards
                className="w-full"
                label="Source"
                value={source}
                onValueChange={setSource}
                options={[
                  {
                    value: "ocr",
                    label: "Bank OCR",
                    description: "AvtaleGiro and KID payments",
                    icon: BuildingIcon,
                  },
                  {
                    value: "vipps",
                    label: "Vipps",
                    description: "Settlement report",
                    icon: SmartphoneIcon,
                  },
                ]}
              />
            </Example>
          </div>
          <Example
            title="DonorPicker"
            use="Pick one donor by name, email or donor ID (⌘K's search, in a form). Controlled; Enter picks, Esc closes."
            surfaceClassName="grid gap-4 sm:grid-cols-2"
          >
            <Field label="Donor" hint="Searches as you type; +word requires, -word excludes.">
              <DonorPicker
                value={pickedDonor}
                onValueChange={setPickedDonor}
                search={fakeDonorSearch}
              />
            </Field>
            <Field label="Merge into" error="Pick the donor to keep">
              <DonorPicker value={null} onValueChange={() => {}} search={fakeDonorSearch} />
            </Field>
          </Example>
        </div>
      </DocSection>

      <DocSection
        id="filter-bar"
        title="Filter bar"
        description="Search, active filters as chips, “Add filter” for the rest, saved views. State lives in the URL: try a filter and copy the address."
      >
        <Example title="FilterBar" surfaceClassName="block">
          <FilterBar
            list={list}
            searchPlaceholder="Donor, KID or ID"
            end={<SavedViews list={list} />}
          >
            <DateRangeFilter field="date" label="Date" />
            <RangeFilter field="amount" label="Amount" format="money" unit="kr" histogram={bins} />
            <OptionsFilter
              field="method"
              label="Payment method"
              options={paymentMethods.map((m) => ({ value: m.id, label: m.name }))}
            />
            <BooleanFilter
              field="newsletter"
              label="Newsletter"
              trueLabel="Subscribed"
              falseLabel="Not subscribed"
            />
            <ChoiceFilter
              field="fundraiser"
              label="Fundraisers"
              options={[
                { value: "atLeastOnce", label: "Gave to a fundraiser" },
                { value: "only", label: "Only gave to fundraisers" },
                { value: "never", label: "Never gave to a fundraiser" },
              ]}
            />
            <TextFilter field="kid" label="KID" numeric />
          </FilterBar>
          <p className="mt-3 font-mono text-xs break-all text-muted-foreground">
            URL: ?
            {new URLSearchParams(list.search as Record<string, string>).toString() ||
              "(no filters yet)"}
          </p>
        </Example>
      </DocSection>

      <DocSection
        id="values"
        title="Values"
        description="Money, numbers, dates and identifiers each have exactly one component."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Example title="Money and numbers" use="NOK; tabular figures; signed for corrections.">
            <Money value={1438093} className="font-semibold" />
            <Money value={249.5} />
            <Money value={-500} signed />
            <Money value={"18200.00"} />
            <Num value={1240} />
            <Num value={0.183} percent />
            <Money value={null} />
          </Example>
          <Example
            title="Dates"
            use="Absolute in tables and forms, relative for activity; the other form is in the tooltip."
          >
            <DateTime value="2026-10-23T09:14:00Z" />
            <DateTime value="2026-10-23T09:14:00Z" format="datetime" />
            <DateTime value="2026-10-23T09:14:00Z" format="relative" />
            <DateTime value="2026-10-01" format="month" />
            <DateTime value={null} />
          </Example>
          <Example title="Identifiers" use="Copy button on hover or focus. Never truncate an id.">
            <CopyValue value="96891492" label="KID" />
            <CopyValue value={1387} prefix="#" label="donor ID" />
            <CopyValue value="agr_5kSeqz" label="agreement ID" />
          </Example>
          <Example
            title="Inline edit"
            use="Low-risk single fields only (name, email). Enter saves, Escape cancels."
          >
            <InlineEdit
              label="Name"
              value={name}
              onSave={async (next) => {
                await new Promise((r) => setTimeout(r, 400));
                setName(next);
              }}
            />
          </Example>
        </div>
      </DocSection>

      <DocSection
        id="status"
        title="Status and badges"
        description="Status is a lifecycle state from a catalog in lib/status.ts (dot + label, quiet). Badge is a category label."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Example title="Agreement · charge · import" surfaceClassName="grid gap-3">
            <div className="flex flex-wrap gap-4">
              {(Object.keys(agreementStatus) as (keyof typeof agreementStatus)[]).map((s) => (
                <Status key={s} catalog={agreementStatus} value={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {(Object.keys(chargeStatus) as (keyof typeof chargeStatus)[]).map((s) => (
                <Status key={s} catalog={chargeStatus} value={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {(Object.keys(importStatus) as (keyof typeof importStatus)[]).map((s) => (
                <Status key={s} catalog={importStatus} value={s} />
              ))}
            </div>
          </Example>
          <Example title="Badge tones">
            <Badge>Default</Badge>
            <Badge tone="outline">AvtaleGiro</Badge>
            <Badge tone="accent">New</Badge>
            <Badge tone="success">Matched</Badge>
            <Badge tone="warning">Dry run</Badge>
            <Badge tone="danger">Duplicate</Badge>
            <span className="flex items-center gap-1 text-sm">
              Search <Kbd>⌘K</Kbd>
            </span>
          </Example>
        </div>
      </DocSection>

      <DocSection id="data-display" title="Facts and figures">
        <div className="grid gap-4 lg:grid-cols-2">
          <Example
            title="PropertyList"
            use="Facts about one record. Labels in a fixed column."
            surfaceClassName="block"
          >
            <PropertyList>
              <Property label="KID">
                <CopyValue value="96891492" label="KID" />
              </Property>
              <Property label="Monthly" hint="Charged on the 20th">
                <Money value={500} className="font-semibold" />
              </Property>
              <Property label="Status">
                <Status catalog={agreementStatus} value="active" />
              </Property>
              <Property label="Cancelled" />
            </PropertyList>
          </Example>
          <Example
            title="StatGroup"
            use="2–5 headline numbers in one strip."
            surfaceClassName="block"
          >
            <StatGroup>
              <Stat
                label="This month"
                value={<Money value={1_212_000} />}
                delta={0.18}
                deltaLabel="vs. September"
              />
              <Stat label="Donors" value={<Num value={1394} />} hint="gave this month" />
              <Stat label="Average" value={<Money value={870} />} />
            </StatGroup>
          </Example>
        </div>
      </DocSection>

      <DocSection
        id="distribution"
        title="Distributions"
        description="Organizations are the focus: one bar of organizations in stable colours, cause areas only when they add something. The editor is used everywhere a split is edited: donation edit, manual registration, agreements, new KID, review queue. Try the arrow keys in a percentage field (Shift for steps of 10)."
      >
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <DistributionEditor config={causeAreas} value={distribution} onChange={setDistribution} />
          <div className="grid min-w-0 grid-cols-1 gap-4">
            <Example title="Read-only summary, Global Health only" surfaceClassName="block">
              <DistributionSummary
                config={causeAreas}
                draft={draftFromApi(causeAreas, avtaleGiroDetail.distribution)}
                amount="500"
              />
            </Example>
            <Example title="Across cause areas" surfaceClassName="block">
              <DistributionSummary
                config={causeAreas}
                draft={draftFromApi(causeAreas, mixedDistribution)}
              />
            </Example>
            <Example title="In a list cell (hover for every organization)" surfaceClassName="block">
              <div className="grid gap-2">
                <OrgSparkline
                  slices={orgSlices(
                    draftFromApi(causeAreas, avtaleGiroDetail.distribution),
                    causeAreas,
                  )}
                />
                <OrgSparkline
                  slices={orgSlices(draftFromApi(causeAreas, mixedDistribution), causeAreas)}
                />
              </div>
            </Example>
          </div>
        </div>
      </DocSection>

      <DocSection
        id="feedback"
        title="Feedback"
        description="Callouts sit where the problem is and stay; toasts confirm what just happened and go away. Errors always say what to do next."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <Callout tone="accent" title="Dry run">
              Nothing will be registered. Turn it off to import for real.
            </Callout>
            <Callout tone="success" title="412 donations registered" />
            <Callout tone="warning" title="4 transactions need review">
              They wait in the review queue.
            </Callout>
            <Callout tone="danger" title="The file could not be read">
              It doesn't look like a Nets OCR file. Check the source and try again.
            </Callout>
          </div>
          <div className="grid content-start gap-4">
            <Example title="Toasts" use="notify.success / notify.error / notify.undo">
              <Button onClick={() => notify.success("Donor updated")}>Success</Button>
              <Button onClick={() => notify.error(new Error("Failed to fetch"))}>Error</Button>
              <Button
                onClick={() => notify.undo("Skipped transaction", () => notify.info("Restored"))}
              >
                With undo
              </Button>
            </Example>
            <ErrorState error={new Error("Failed to fetch")} onRetry={() => undefined} />
          </div>
        </div>
      </DocSection>

      <DocSection id="states" title="Empty and loading">
        <div className="grid gap-4 lg:grid-cols-2">
          <Example title="Empty" surfaceClassName="block p-0">
            <EmptyState
              icon={InboxIcon}
              size="sm"
              title="No agreements"
              description="This donor gives one-off only."
              action={
                <Button size="sm">
                  <PlusIcon />
                  New agreement
                </Button>
              }
            />
          </Example>
          <Example
            title="Loading (first load)"
            use="The real component with placeholder values (Stat pending, Property pending). See Loading below."
            surfaceClassName="block"
          >
            <div data-static className="grid gap-3">
              <StatGroup>
                <Stat label="Expected" pending />
                <Stat label="Received" pending />
              </StatGroup>
              <PropertyList labelWidth="6rem">
                <Property label="Name" pending placeholder="Firstname Lastname" />
                <Property label="Email" pending placeholder="name@example.org" />
              </PropertyList>
            </div>
          </Example>
          <Example
            title="JSON"
            use="Raw API or log payloads (import log entries)."
            surfaceClassName="block p-0 border-0"
          >
            <JsonViewer
              data={{
                file: "ocr-2026-10-23.txt",
                valid: 412,
                invalid: 4,
                dryRun: false,
                kids: ["77812094"],
              }}
            />
          </Example>
          <Example title="Attention list" surfaceClassName="block p-0 border-0">
            <AttentionList
              items={[
                {
                  id: "a",
                  icon: InboxIcon,
                  tone: "warning",
                  title: "To review",
                  count: 4,
                  href: "/design/flow",
                  action: "Review",
                },
                {
                  id: "b",
                  icon: CalendarCheckIcon,
                  tone: "danger",
                  title: "Missing payments",
                  count: 3,
                  href: "/design",
                  action: "Check",
                },
              ]}
            />
          </Example>
        </div>
      </DocSection>

      <DocSection
        id="loading"
        title="Loading"
        description={
          <>
            Nothing shows for loads under 300 ms. A first load draws the real layout with
            placeholder values; a change of day, page, filter or row keeps what is on screen,
            dimmed, with the progress line along the top; a route change keeps the previous page
            until the next one's record is in. See DESIGN.md › Loading.
          </>
        }
      >
        <Example
          title="Try it"
          use="A fake API. Reload for a first load (skeletons only with the slow API); step through days to see the previous day kept (neighbours are prefetched, so going back is instant)."
          surfaceClassName="block"
        >
          <LoadingDemo />
        </Example>
        <div className="grid gap-4 lg:grid-cols-2">
          <Example
            title="SkeletonText"
            use="A value's placeholder inside its real label, heading or cell: the sample text sets the size."
          >
            <div data-static className="grid gap-1">
              <span className="font-display text-2xl">
                <SkeletonText>Firstname Lastname</SkeletonText>
              </span>
              <span className="text-sm text-muted-foreground">
                <SkeletonText>#00000</SkeletonText> · <SkeletonText>name@example.org</SkeletonText>
              </span>
            </div>
          </Example>
          <Example
            title="Tab counts"
            use="count={null} while loading reserves the badge, so the tabs don't move."
            surfaceClassName="block"
          >
            <div data-static>
              <Tabs value="a">
                <TabsList>
                  <TabsTrigger value="a" count={null}>
                    Missing
                  </TabsTrigger>
                  <TabsTrigger value="b" count={40}>
                    Expected
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="a" className="text-sm text-muted-foreground">
                  Missing payments load here.
                </TabsContent>
                <TabsContent value="b" />
              </Tabs>
            </div>
          </Example>
        </div>
      </DocSection>

      <DocSection
        id="overlays"
        title="Overlays"
        description="Dialog for short focused tasks; ConfirmDialog for irreversible and financial actions; menus for secondary actions; tooltips only for icon buttons and abbreviations."
      >
        <Example title="Overlays">
          <Dialog>
            <DialogTrigger asChild>
              <Button>Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Resend receipt</DialogTitle>
                <DialogDescription>Sends the receipt for donation #98 012 again.</DialogDescription>
              </DialogHeader>
              <Field label="Send to" hint="Leave as is to use the donor's email.">
                <Input defaultValue="elias.olsen@example.org" />
              </Field>
              <DialogFooter>
                <Button variant="primary">Send receipt</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            tone="danger"
            title="Refund 500 kr to Kari Nordby?"
            consequences={[
              "500 kr goes back to the donor's Vipps account.",
              "The donation is marked refunded and removed from tax reports.",
            ]}
            confirmLabel="Refund 500 kr"
            confirmText="500"
            onConfirm={() => void notify.success("Refunded 500 kr")}
            trigger={<Button>Confirm with typed amount</Button>}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                Menu <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <ArrowDownToLineIcon /> Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="danger">
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" aria-label="Edit amount">
                <PencilIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit amount</TooltipContent>
          </Tooltip>
        </Example>
      </DocSection>

      <DocSection id="tabs" title="Tabs">
        <Tabs defaultValue="donations">
          <TabsList>
            <TabsTrigger value="donations" count={23}>
              Donations
            </TabsTrigger>
            <TabsTrigger value="agreements" count={2}>
              Agreements
            </TabsTrigger>
            <TabsTrigger value="kids">KIDs</TabsTrigger>
          </TabsList>
          <TabsContent value="donations" className="text-sm text-muted-foreground">
            Related records for one parent, never top-level navigation.
          </TabsContent>
          <TabsContent value="agreements" className="text-sm text-muted-foreground">
            Agreements tab.
          </TabsContent>
          <TabsContent value="kids" className="text-sm text-muted-foreground">
            KIDs tab.
          </TabsContent>
        </Tabs>
      </DocSection>
    </DocPage>
  );
}
