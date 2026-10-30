import { createFileRoute } from "@tanstack/react-router";
import { MoonIcon, SunIcon } from "lucide-react";
import { Money } from "@/components/domain/format";
import { Status } from "@/components/domain/status";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { donations } from "@/design-system/fake-data";
import { DocPage, DocSection } from "@/design-system/doc";
import { usePreferences, type Density } from "@/lib/preferences";
import { agreementStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/design/")({
  component: Foundations,
});

const principles = [
  {
    title: "Money is never ambiguous",
    body: "One way to show amounts, dates and ids. Anything that moves money is explicit, confirmed with the amount in the button, and its result is visible.",
  },
  {
    title: "Quiet until it matters",
    body: "Ink on paper. Colour is reserved for state: green flows, amber waits, red needs you. A screen with nothing wrong has almost no colour.",
  },
  {
    title: "Find, then act",
    body: "⌘K finds any donor, donation, KID or agreement. Lists filter in place and keep their state in the URL. A row opens its record as a panel over the list; panels stack, and the full page is one click away.",
  },
  {
    title: "Built for the hundredth time",
    body: "Ops repeat the same jobs daily. Keyboard paths for every frequent action, density you can turn up, and flows that remember where you were.",
  },
  {
    title: "One concept, one component",
    body: "Agreements are one model across Vipps and AvtaleGiro. Distributions have one editor. Statuses have one vocabulary. Pages come from four templates.",
  },
  {
    title: "Say what happened",
    body: "Plain English, sentence case, verbs on buttons. Errors say what went wrong and what to do next, never just “Error”.",
  },
];

const colorTokens: { name: string; token: string; use: string; text?: boolean }[] = [
  { name: "background", token: "--background", use: "Content sheet, tables, forms" },
  { name: "canvas", token: "--canvas", use: "Chrome around the sheet: sidebar, gutters" },
  { name: "muted", token: "--muted", use: "Quiet fills: unused rows, panel headers" },
  { name: "foreground", token: "--foreground", use: "Text, primary buttons (ink)", text: true },
  {
    name: "muted-foreground",
    token: "--muted-foreground",
    use: "Labels, secondary text (6.7:1)",
    text: true,
  },
  {
    name: "faint-foreground",
    token: "--faint-foreground",
    use: "Placeholders, icons, dashes (≥4.5:1)",
    text: true,
  },
  { name: "border", token: "--border", use: "Dividers and table rules" },
  { name: "input", token: "--input", use: "Control outlines (≥3:1 against surfaces)" },
  {
    name: "accent",
    token: "--accent",
    use: "Interactive and “you are here”: links, focus, selection",
    text: true,
  },
  { name: "success", token: "--success", use: "Money flowing, done", text: true },
  { name: "warning", token: "--warning", use: "Waiting, needs a look", text: true },
  { name: "danger", token: "--danger", use: "Failed, reversed, destructive", text: true },
];

const typeScale = [
  {
    token: "text-3xl",
    size: "32/40",
    use: "Reference page titles",
    sample: "Donations",
    display: true,
  },
  {
    token: "text-2xl",
    size: "26/32",
    use: "Page titles (display face)",
    sample: "Elias Olsen",
    display: true,
  },
  {
    token: "text-xl",
    size: "20/28",
    use: "Headline numbers, section titles in docs",
    sample: "1 438 093 kr",
  },
  {
    token: "text-lg",
    size: "16/24",
    use: "Dialog titles",
    sample: "Stop this agreement?",
  },
  {
    token: "text-base",
    size: "14/22",
    use: "Body, form values, section headings",
    sample: "The donor gets an email confirming it.",
  },
  {
    token: "text-sm",
    size: "13/20",
    use: "Tables, labels, buttons, meta",
    sample: "AvtaleGiro · 20th of every month",
  },
  {
    token: "text-xs",
    size: "12/16",
    use: "Table headers, hints, badges",
    sample: "Kept so the same transaction is never registered twice.",
  },
];

function Swatch({ token, name, use, text }: (typeof colorTokens)[number]) {
  return (
    <div className="grid grid-cols-[3rem_1fr] items-center gap-3">
      <div
        className="grid h-10 place-content-center rounded-sm border border-border text-sm font-semibold"
        style={
          text
            ? { color: `var(${token})`, background: "var(--background)" }
            : { background: `var(${token})` }
        }
      >
        {text ? "Aa" : ""}
      </div>
      <div className="min-w-0">
        <p className="font-mono text-xs">{name}</p>
        <p className="text-sm text-muted-foreground">{use}</p>
      </div>
    </div>
  );
}

function Foundations() {
  const prefs = usePreferences();
  return (
    <DocPage
      title="Foundations"
      intro={
        <>
          The admin is a calm, dense tool for a small team handling money all day. These are the
          decisions everything else follows. The full reasoning is in{" "}
          <code className="font-mono text-sm">docs/admin-design.md</code>.
        </>
      }
    >
      <DocSection id="principles" title="Principles">
        <ol className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((principle, index) => (
            <li key={principle.title} className="grid content-start gap-1.5">
              <span className="num text-sm text-faint-foreground">0{index + 1}</span>
              <h3 className="font-semibold">{principle.title}</h3>
              <p className="text-sm text-muted-foreground">{principle.body}</p>
            </li>
          ))}
        </ol>
      </DocSection>

      <DocSection
        id="colour"
        title="Colour"
        description="Warm neutral “paper” greys and near-black “ink”, so long sessions are easy on the eyes. One accent (blue) for interaction; three tones for state. Both themes meet WCAG AA for text and 3:1 for control outlines."
      >
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => prefs.setTheme("light")}
            aria-pressed={prefs.resolvedTheme === "light"}
          >
            <SunIcon />
            Light
          </Button>
          <Button
            onClick={() => prefs.setTheme("dark")}
            aria-pressed={prefs.resolvedTheme === "dark"}
          >
            <MoonIcon />
            Dark
          </Button>
        </div>
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {colorTokens.map((token) => (
            <Swatch key={token.name} {...token} />
          ))}
        </div>
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">Tones in use</h3>
          <div className="flex flex-wrap gap-6 rounded-md border border-border p-4">
            {(Object.keys(agreementStatus) as (keyof typeof agreementStatus)[]).map((status) => (
              <Status key={status} catalog={agreementStatus} value={status} />
            ))}
            <Money value={-500} signed />
            <a
              href="#colour"
              className="text-sm text-accent underline decoration-accent/30 underline-offset-4"
            >
              A link
            </a>
          </div>
        </div>
      </DocSection>

      <DocSection
        id="type"
        title="Type"
        description="ES Klarheit Grotesk for everything; ES Klarheit Kurrent only for page titles, where the brand gets one moment per screen. Numbers always use tabular figures so columns line up."
      >
        <div className="divide-y divide-border rounded-md border border-border">
          {typeScale.map((row) => (
            <div
              key={row.token}
              className="grid items-baseline gap-2 px-4 py-3 sm:grid-cols-[8rem_5rem_1fr]"
            >
              <code className="font-mono text-xs">{row.token}</code>
              <span className="num text-xs text-muted-foreground">{row.size}</span>
              <div className="min-w-0">
                <p className={cn(row.token, row.display && "font-display", "truncate")}>
                  {row.sample}
                </p>
                <p className="text-xs text-muted-foreground">{row.use}</p>
              </div>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection id="space" title="Space, shape and depth">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold">Spacing: 4 px grid</h3>
            {[1, 2, 3, 4, 6, 8, 10].map((step) => (
              <div key={step} className="flex items-center gap-3 text-xs">
                <span className="num w-10 text-muted-foreground">{step * 4} px</span>
                <span className="h-2 rounded-xs bg-accent" style={{ width: step * 4 }} />
              </div>
            ))}
            <p className="text-sm text-muted-foreground">
              Gaps inside a component 4–8; between components 12–16; between sections 24–32.
            </p>
          </div>
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold">Radii</h3>
            <div className="flex flex-wrap gap-3">
              {[
                ["xs", "2", "badges, kbd"],
                ["sm", "4", "controls"],
                ["md", "6", "panels"],
                ["lg", "10", "dialogs, sheet"],
              ].map(([name, px, use]) => (
                <div key={name} className="grid justify-items-center gap-1 text-xs">
                  <div className={cn("size-12 border border-input bg-muted", `rounded-${name}`)} />
                  <span className="font-mono">
                    {name} · {px}
                  </span>
                  <span className="text-muted-foreground">{use}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold">Elevation and motion</h3>
            <div className="flex gap-3">
              <div className="grid h-16 flex-1 place-content-center rounded-md border border-border text-xs text-muted-foreground">
                Flat (default)
              </div>
              <div className="grid h-16 flex-1 place-content-center rounded-md border border-border bg-popover text-xs text-muted-foreground shadow-overlay">
                Overlay
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Borders separate; only floating things cast a shadow. Motion is 100–240 ms ease-out,
              only to show where something came from, and off with reduced motion.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection
        id="density"
        title="Density"
        description="Comfortable by default; compact fits about 30 % more rows for people who live in lists. The setting is per browser, in the user menu and ⌘K."
      >
        <SegmentedControl<Density>
          label="Density"
          value={prefs.density}
          onValueChange={prefs.setDensity}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <div className="overflow-hidden rounded-md border border-border">
          <Table aria-label="Density sample">
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {donations.slice(0, 5).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-semibold">{row.donor}</TableCell>
                  <TableCell>{row.paymentMethod}</TableCell>
                  <TableCell className="text-right">
                    <Money value={row.sum} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DocSection>
    </DocPage>
  );
}
