# Admin design system

The admin is a dense, calm tool for a small ops team that handles donations, agreements and tax
data every day. It is used for hours at a time, the same jobs are repeated many times a day, and
mistakes cost money. Everything below follows from that.

Live reference: run `pnpm dev` and open `/design` (works without the API or a login).

## Principles

1. **Money is never ambiguous.** One way to show amounts, dates and ids. Anything that moves money
   is explicit, confirmed with the amount in the button, and its result is visible.
2. **Quiet until it matters.** Ink on paper. Colour is reserved for state: green flows, amber
   waits, red needs you. A screen with nothing wrong has almost no colour.
3. **Find, then act.** ⌘K finds any donor, donation, KID or agreement. Lists filter in place and
   keep their state in the URL. Rows peek with one click; the full page is one key away.
4. **Built for the hundredth time.** Keyboard paths for frequent actions, a compact density,
   flows that remember where you were.
5. **One concept, one component.** Agreements are one model across Vipps and AvtaleGiro.
   Distributions have one editor. Statuses have one vocabulary. Pages come from four
   templates.
6. **Say what happened.** Plain English, sentence case, verbs on buttons. Errors say what went
   wrong and what to do next.

## What changed from the old admin, and why

| Old                                       | New                                                                           | Why                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Black sidebar, notch on the active item   | Paper-coloured sidebar, active item as a raised white tab with an accent icon | The sidebar was the loudest thing on every screen; the content should be.          |
| Page title with a thick left bar          | Display-face title, breadcrumbs above, a meta line of facts below             | The bar carried no information; breadcrumbs and facts do.                          |
| Black filter drawer on the right          | Inline filter bar: search, chips, “Add filter”, saved views; URL-backed       | Filters were hidden and unshareable. Chips show what is applied at a glance.       |
| Double-click a row to open                | Click/Space peeks, Enter opens, ⌘-click new tab, j/k moves                    | Double-click is undiscoverable and slow; peeking keeps your place in the list.     |
| Vipps and AvtaleGiro as unrelated lists   | One Agreements list and model with a type filter                              | The job (“what does this donor give monthly?”) doesn't care about the provider.    |
| Pages by table (Register, Reports, Logs…) | IA by job (below)                                                             | People think “money came in” not “Register”.                                       |
| Review queue lost on reload               | Persistent queue, worked one item at a time with a prefilled form             | It was the most fragile part of the most important flow.                           |
| Norwegian and English mixed               | English UI throughout; product names (KID, AvtaleGiro, Vipps) kept            | English is the team's common language.                                             |
| Courier numbers                           | Tabular figures in the brand face, Norwegian number and date formats          | Columns line up.                                                                   |
| Square, monochrome, pure black/white      | Warm paper/ink neutrals, small radii, one accent, three state tones           | Pure #000 on #fff is tiring for long sessions; state needs colour to be scannable. |

## Information architecture

```
Home                       what needs attention today, then this month's numbers, recent imports
Donors
  Donors                   list → donor page (contact, totals, agreements, KIDs, tax units)
  Fundraisers
Money in
  Donations                list → donation page (edit, delete, resend receipt)
  Distributions            KIDs and their split
  Import                   flow: source → upload → result → review
  Review queue  [n]        unmatched transactions, worked one by one
Agreements
  Agreements               Vipps + AvtaleGiro, one list
  Vipps charges            charges, refunds
  AvtaleGiro check         daily expected vs received
Regranting
  Balances                 what each recipient is owed (expand to projects) → recipient statement
  Rounds                   list → round builder: fund grants, payments by payee, approve, record payments
  Projects                 list → project page (facts, everything sent to it)
  Adjustments              ledger entries with a reason (corrections, fees, fronted …)
  Payees & funds           payees, dated routing, own funds, holds
Records
  Reports                  transaction report
  Import log
Settings                   cause areas & organizations (standard split), referral types, Vipps matching rules
```

The nav is data (`src/components/layout/nav.ts`) and also feeds ⌘K.

## Page templates

Feature pages are built from these; don't lay out a page by hand.

| Template       | Use for             | Composition                                                                                                                                                                              |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ListPage`     | Any list of records | `title`, `actions` (≤1 primary), `filters={<FilterBar>}`, `peek={<PeekPanel>}`, child `<DataTable>` with `summary`                                                                       |
| `DetailPage`   | One record          | `breadcrumbs`, `title`, `adornment` (status), `meta` (facts), `actions`, `stats={<StatGroup>}`, `aside` (`DetailPanel`s with `PropertyList`s), children = related records (tabs, charts) |
| `FlowPage`     | Multi-step jobs     | `steps`, `current`, `footer={<FlowFooter back next info>}`, `width` narrow/wide; state in `usePersistentState`                                                                           |
| `SettingsPage` | Configuration       | `nav` of sections, children = `SettingsSection`s; explicit save with `UnsavedChangesBar`                                                                                                 |
| `HomeView`     | Home only           | attention list, stats, chart, recent imports                                                                                                                                             |

### Building a list page (the common case)

```tsx
const donationsList = defineList({
  id: "donations",
  filters: { q: param.text, amount: param.range, date: param.dateRange, method: param.numberList },
  sortable: ["timestamp", "sum", "donor"],
  defaultSort: { id: "timestamp", desc: true },
});

export const Route = createFileRoute("/_app/donations/")({
  validateSearch: donationsList.validateSearch,
  component: DonationsPage,
});

function DonationsPage() {
  const list = useListState(donationsList);
  const trpc = useTRPC();
  const listOptions = (page: number) =>
    trpc.donations.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort: { id: list.sort.id, desc: list.sort.desc },
      filter: toApiFilter(list.filters), // map ranges/dates to the procedure's filter shape
    });
  // Keeps the current rows while the next filter/sort/page loads; prefetches the next page.
  const query = usePageQuery(listOptions(list.page), {
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  const [peekId, setPeekId] = useState<number | null>(null);

  return (
    <ListPage
      title="Donations"
      actions={<Button variant="primary">Register donation</Button>}
      filters={
        <FilterBar list={list} searchPlaceholder="Donor, KID or donation ID" end={<SavedViews list={list} />}>
          <DateRangeFilter field="date" label="Date" />
          <RangeFilter field="amount" label="Amount" format="money" unit="kr" histogram={bins} />
          <OptionsFilter field="method" label="Payment method" options={methods} />
        </FilterBar>
      }
      peek={peeked && <PeekPanel title={…} href={`/donations/${peeked.id}`} onClose={() => setPeekId(null)}>…</PeekPanel>}
    >
      <DataTable
        label="Donations"
        columns={columns}
        data={query.data?.rows}
        rowCount={…}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        getRowId={(row) => String(row.id)}
        {...list.tableState}
        onRowPeek={(row) => setPeekId(row.id)}
        onRowOpen={(row) => navigate({ to: "/donations/$id", params: { id: String(row.id) } })}
        peekedRowId={peekId != null ? String(peekId) : null}
        getRowHref={(row) => `/donations/${row.id}`}
        pageHotkeys
        summary={<TableSummary items={[…]} />}
      />
    </ListPage>
  );
}
```

`/design/list` and `/design/agreements` are complete, working versions of this with fake data.

## Interaction patterns

### Finding

- **⌘K** (also the sidebar search box): one box for records and commands. Providers decide from
  the query what it could be (digits → donor id, donation id, KID, review item; `agr_…` or
  `VA_…` → Vipps agreement; text → donor name/email, review items by payer, message or
  reference) and run in parallel. Add providers in `src/features/search/api-providers.ts`.
- **`/`** focuses the list search. **Filters** are chips; each opens its own editor. The URL holds
  the whole view (`?amount=100..500&method=4,8&sort=-sum&page=2`), so sharing a view is copying
  the address. **Saved views** name a combination per list (per browser).
- **History**: applying or removing a filter, sorting and paging are history entries, so Back
  undoes them one at a time and never jumps out of the list. Refining a search that is already
  applied, and quick repeated changes to one filter (dragging a range), replace the entry.
- **Empty lists** (`ListEmpty`): without filters, "No charges yet" and why; with filters or a
  search, "No results" and Clear all. Never "Nothing matches these filters" when none are set.

### List → detail

Click or Space peeks (side panel on wide screens, sheet on narrow), j/k or ↑/↓ moves and the
peek follows, Enter opens the full page, ⌘/Ctrl-click opens it in a new tab, x selects, Esc
closes the peek. There is no double-click anywhere. Bulk actions appear in the table footer while
rows are selected.

### Editing, by risk

| Risk           | Examples                                              | Pattern                                                                                                                          |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Low, one field | donor name, email, newsletter                         | `InlineEdit` / `Switch`; save on Enter/toggle; undo toast for toggles                                                            |
| Several fields | settings, tax unit, matching rule                     | form + `UnsavedChangesBar` (explicit save, leaving asks first); in a dialog, closing with changes asks first (`useDiscardGuard`) |
| Moves money    | donation amount/date/split, agreement amount          | form + `ConfirmDialog` showing before → after, amount in the button                                                              |
| Irreversible   | delete donation, merge donors, stop agreement, refund | `ConfirmDialog tone="danger"` with `consequences`; `confirmText` (type the id/amount) for merges and refunds                     |

### Optimism, undo and feedback

- Optimistic only for cheap, reversible, non-financial changes (newsletter, name, saved views,
  skipping a review item). Everything in a confirmation waits for the server and shows
  `pending` on the button.
- Undo (`notify.undo`) only for actions done _without_ confirmation. Never both. Undoing is
  confirmed with a plain success toast ("Change undone"), never with another Undo.
- `notify.success` for things that happened (short, past tense), with at most one action to
  what was just made ("Open donation" after registering). `notify.error(error)` for
  failures outside dialogs; inside a dialog, keep it open and show the error in it. Section load
  failures use `ErrorState` in place with Try again. A record that doesn't exist (deleted,
  merged into another) can't come back on retry: `ErrorState` with `back` links to its list
  instead. Persistent page-level messages use `Callout`.
- Loading: see [Loading](#loading). Never a full-page spinner, never skeletons on a parameter
  change, nothing at all for loads under 300 ms.

### Loading

Loading should be invisible when it's fast and calm when it isn't: nothing jumps, nothing
flashes, and what's on screen stays until its replacement is ready.

**Delays.** No indicator for anything that finishes within 300 ms (`PENDING_DELAY_MS`,
`--delay-pending`); once shown, an indicator stays at least 400 ms so a slow load doesn't end in
a blink. `useDelayedFlag` drives the progress bar and dimming; skeletons get the same delay
in CSS (transparent, then fade in). Under reduced motion they appear without pulsing and the
progress bar is a static line. Buttons keep their own rule: `pending` shows at once.

**Which indicator.**

| Situation                                                        | What shows                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| First load of a page or section (no data yet)                    | The real layout with placeholder values (below)                                                 |
| A parameter changes: day, page, filter, sort, period, peeked row | The current content stays, dimmed (`Updating`, DataTable `isFetching`), + the top progress line |
| Navigating to another page                                       | The previous page stays, with the top progress line, until the next page's data is in (≤ 1 s)   |
| Background refetch (after a mutation, interval)                  | Nothing, or rows dim slightly if it takes > 300 ms                                              |
| A form or editor whose reference data is loading                 | `Pending`: its space reserved, the top progress line; no fake fields                            |
| An action                                                        | `pending` on its button                                                                         |

**Keep the previous data on parameter changes.** Every query whose input comes from the URL or
local state uses `usePageQuery` (`src/lib/query.ts`): `keepPreviousData`, reports to the top
progress line, and `prefetch` for what comes next. Plain `useQuery` is only for inputs that
don't change while the page is open (the record of a route). Never return a skeleton because
`isPending` became true again after a change; `isPlaceholderData` means "updating", wrap that
region in `<Updating active>`.

**Skeletons only on first load, and only from real components.** Never draw a page layout by
hand with skeleton bars. The primitives render their real structure with a same-size
placeholder:

- `DataTable isLoading`: placeholder rows from its real columns at the real row height
  (`meta.placeholder` gives a column its typical width, `cellPlaceholder` has the common ones).
  They are **invisible**: lists show no skeletons; the rows only hold the table's height and
  column widths, and the real rows fade in over them.
- `Stat pending` (label stays, value and hint line reserved), `Property pending` (label stays),
  `TabsTrigger count={null}` (badge space reserved), `AttentionList pending`.
- `SkeletonText` for a value inside a real heading, meta line or cell: its sample text gives the
  size (`<SkeletonText>Firstname Lastname</SkeletonText>`).
- Charts (`BarChart data={undefined}`) and panels keep a fixed size and fade in; a `Skeleton`
  box is only for reserving such a fixed size.

A page that needs a first-load state (only on the app's first load or a slow navigation) renders
its template (`DetailPage`, …) with these, as the donor and AvtaleGiro pages do.

**Prefetch.** Links preload on hover and focus (`defaultPreload: "intent"`); DataTable rows with
`getRowHref` do the same on hover and when the cursor moves to them. Detail routes have a loader
built on `loadPage` (`src/lib/route-data.ts`) that warms every query the page shows (the record
in its own request, the rest in a second batch). On a preload or a navigation it resolves when
they're in, or after 1 s, so the page arrives finished: the router reuses a preloaded match
without running the loader again, and a navigation that starts during the preload waits for it.
On the app's first load and on search-param changes it doesn't wait. Lists prefetch the next
page; the AvtaleGiro check the previous and next day and today; the review workbench the next
and previous item. Queries are fresh for 30 s (`createQueryClient`), so a prefetch is used;
mutations still invalidate what they change. A loader must not use `loaderDeps` for parameters
the page itself steps through (the AvtaleGiro date): that turns each step into a navigation that
waits.

**Reserve space for what arrives late.** Counts in tab badges (`count={null}`), stat hint
lines, footers, chart legends (always shown), the nav review badge (in the row, right-aligned),
images (`width`/`height`). When the amount is unknown, reserve what was there last time (Home's
attention list remembers its row count). Content that appears only sometimes (the AvtaleGiro
estimate note) goes where it moves nothing: below fixed-height content, never above it.

`tests/interaction/loading.spec.ts` measures layout shift (CLS) on Home, the donors list, a
donor and the AvtaleGiro check against a slow stubbed API, and that changing the day shows no
skeleton. Keep it under 0.02.

### Imports and the review queue

`FlowPage` with Source → Upload → Result → Review (`/import`). Unmatched transactions go into the
server-side review queue (`reports.reviewQueue.*`, shared by the whole team and deduplicated by
source + transaction id), so nothing is lost on reload or on another machine; the nav badge shows
the open count. `ReviewWorkbench` (`/import/review/$id`) shows one item at a time: the raw
transaction left, a registration form prefilled from it right (existing KID or new distribution),
Register (⌘Enter), Skip (moves on, changes nothing), or Ignore with an optional note (undoable,
and ignored items can be reopened). If someone else resolved the item first, it says so and moves
on.

### Keyboard

| Keys                     | Action                         |
| ------------------------ | ------------------------------ |
| ⌘K / Ctrl+K              | Search and commands            |
| ?                        | Shortcut help                  |
| /                        | Focus list search              |
| j / k, ↑ / ↓, Home / End | Move between rows              |
| Space / Enter            | Peek / open                    |
| x                        | Select row                     |
| Esc                      | Close peek, cancel inline edit |
| ⌘Enter                   | Register (review), save        |

Single-key shortcuts are ignored while typing or inside dialogs (`useHotkey`).

**Rows arriving.** `DataTable` fades rows in while they settle 4 px down into place (180 ms), staggered 10 ms per row and capped at 400 ms. It plays only when rows mount (first load, a new page or filter result); refetches and re-sorting reuse rows by id and don't replay it. Transform and opacity only, so it never shifts layout; off under reduced motion. Lists get this for free — don't add per-list animation.

## Tokens

All in `src/styles/app.css`. Tailwind's default palette, sizes, radii and shadows are removed;
only these exist. Components use the semantic layer, never raw values.

- **Colour.** A warm neutral “paper” scale (slightly yellow-shifted greys) and near-black “ink”.
  Pure black on pure white was the old look; it is harsh over a working day. Roles:
  `background` (content sheet), `canvas` (chrome around it), `muted`, `hover`/`pressed`
  (translucent, so they work on any surface), `foreground`, `muted-foreground` (6.7:1),
  `faint-foreground` (≥4.5:1, placeholders and icons), `border`, `border-strong`, `input`
  (≥3:1, control outlines). **Primary is ink**, not blue: the main action reads as the strongest
  thing on the page without adding a colour. **Accent (blue)** means only “interactive / you are
  here”: links, focus rings, the active nav icon, selection, peeked row, current step. **Tones**
  `success`/`warning`/`danger` (+ `-subtle` fills) carry state and nothing else. Dark mode is
  not inverted light mode: surfaces are warm near-blacks (#121211–#252422), text is off-white,
  tones are lightened to keep contrast. Every text pair meets WCAG AA in both themes (checked by
  `test:a11y`).
- **Charts.** `chart-1…5`: ink, accent blue, ochre, teal, light grey — distinguishable in both
  themes and for common colour-vision deficiencies; the largest series is ink.
- **Type.** ES Klarheit Grotesk everywhere; ES Klarheit Kurrent only for page titles (one brand
  moment per screen). Scale: 12 / 13 / 14 / 16 / 20 / 26 / 32. Body 14, tables and controls 13.
  Tabular lining figures for every number (`num` utility; `Money`, `Num`, `DateTime` apply it).
  Sentence case everywhere; no all-caps labels.
- **Space.** 4 px grid. Inside a component 4–8, between components 12–16, between sections 24–32.
  Page gutter 16 (narrow) / 24 (wide).
- **Radii.** 2 (badges, kbd), 4 (controls), 6 (panels), 10 (dialogs, content sheet). Small but
  not zero: softer than the old square look, still precise.
- **Elevation.** Borders separate; only floating things (menus, dialogs, toasts) cast
  `shadow-overlay`. The peek panel has a soft edge shadow.
- **Motion.** 100 / 160 / 240 ms, ease-out, only to show where something came from. Off with
  reduced motion.
- **Density.** `--row-h`, `--control-h`, `--cell-px` switch between comfortable (40/32/12) and
  compact (32/28/8) via `data-density` on `<html>`. Per-browser preference in the user menu and
  ⌘K (`src/lib/preferences.ts`, shared store with the theme).

## Components

Prop conventions: `variant` = visual weight, `tone` = meaning (neutral/accent/success/warning/
danger), `size` = sm/md/lg, `label` = accessible name, `value` + `onChange` (Radix-based
controls: `onValueChange`), `pending` = an action is running. Composition over configuration:
pass children, not config objects, wherever the structure varies.

### Primitives (`src/components/ui`)

| Component                                                                 | Use when                                                                                                                                         | Don't                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `Button`                                                                  | Any action. `primary` once per view; `secondary` default; `ghost` in toolbars/rows; `danger` only to confirm irreversible actions; `link` inline | Use `danger` as a trigger; write “OK”       |
| `Input`, `Textarea`, `Select`, `Combobox`, `DateInput`, `DateRangePicker` | Form values; always inside `Field`                                                                                                               | Build a custom control                      |
| `Field`                                                                   | Label + hint/error for any control (wires id/aria via context)                                                                                   | Put labels in placeholders                  |
| `Checkbox` / `Switch` / `SegmentedControl` / `ChoiceCards`                | independent options / immediate settings / 2–4 modes / a choice that needs a sentence each                                                       | Use a Switch inside a form that saves later |
| `Badge`                                                                   | Category labels (agreement type, “Default”)                                                                                                      | Show lifecycle state (use `Status`)         |
| `Tabs`                                                                    | Related records of one parent                                                                                                                    | Top-level navigation                        |
| `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip`    | Short focused task / via ConfirmDialog / navigation on narrow, peek / filter editors / secondary actions / icon-only buttons                     | Put long forms in dialogs                   |
| `Kbd`                                                                     | Keys in UI copy                                                                                                                                  |                                             |
| `Skeleton`, `SkeletonText`                                                | First-load placeholders inside real components (see Loading); `Skeleton` only to reserve a fixed-size box                                        | Draw a page layout out of skeleton bars     |
| `Updating`, `Pending`, `ProgressBar`                                      | A region showing kept data while the next loads / a form still loading / the top progress line (in the app shell)                                | Show a spinner                              |

### Domain (`src/components/domain`)

| Component                                                                    | Use when                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Money`, `Num`, `DateTime`                                                   | Every amount, count, date. `DateTime` absolute in tables/forms, `relative` for activity; the other form is in the tooltip |
| `CopyValue`                                                                  | Every id people copy: donor/donation id, KID, agreement id, external ref                                                  |
| `Status` + `lib/status.ts`                                                   | Lifecycle state. Add new catalogs there, mapping each value to label, tone and meaning                                    |
| `PropertyList` / `Property`                                                  | Facts about one record                                                                                                    |
| `StatGroup` / `Stat`                                                         | 2–5 headline numbers                                                                                                      |
| `Callout`                                                                    | A message tied to a place on the page                                                                                     |
| `EmptyState`, `ErrorState`                                                   | Nothing to show / failed to load (with retry)                                                                             |
| `InlineEdit`                                                                 | One low-risk field                                                                                                        |
| `ConfirmDialog`                                                              | Irreversible or financial actions                                                                                         |
| `UnsavedChangesBar`                                                          | Explicit-save forms (also blocks navigation while dirty)                                                                  |
| `DistributionEditor`, `DistributionSummary`, `AllocationBar`, `PercentInput` | Every split, editing or reading                                                                                           |
| `AttentionList`                                                              | Home, “what needs me”                                                                                                     |
| `FileDropzone`, `JsonViewer`                                                 | Uploads, raw payloads                                                                                                     |

The API sends amounts and aggregates as decimal strings. Pass them to `Money` / `formatMoney` as
they are; for sums, averages, comparisons and sorting use `src/lib/money.ts` (exact, in øre).
`moneyToNumber` is only for charts, histograms and ratios.

### Money, numbers and dates

One rule each, applied by the formatters, so pages never choose:

- **Money**: whole kroner when the amount has no øre, two decimals when it has any:
  `1 500 kr`, `1 234,50 kr`, `0,30 kr`, fee `0 kr`. A value is always shown the same way, on
  every page; nothing is rounded to whole kroner for display (an average of 1 234,50 is not
  "1 235 kr"). There is no `decimals` prop. A missing amount (no fee) is `–`, in tables,
  peeks and detail pages alike.
- **Money in inputs** (`formatMoneyInput` / `parseMoneyInput`): decimal comma, no grouping,
  øre only when there are any: `1000`, `249,50`. Typing `1 000`, `1000.5` or `500 kr` is
  accepted.
- **Chart axes**: compact from 1 000 up (`7,5k`, `15k`, `1,2M`); tooltips use the money rule.
- **Dates and times** are Oslo time (`Europe/Oslo`), whatever the browser's zone: `24.10.2026`,
  `24.10.2026 14:05`. A day the API sends as `YYYY-MM-DD` is that day. Filters and forms hold
  days as `YYYY-MM-DD` and send them to the API as they are; the API reads a plain date as the
  whole Europe/Oslo day, inclusive, in every procedure. Never send a day as a UTC instant.
  Helpers: `src/lib/dates.ts`. CSV exports write Oslo local time
  (`2026-10-24 14:05:00`).
- **Date entry** is `dd.mm.yyyy`, typed or picked: `DateInput` for one day,
  `DateRangePicker` / the date filter for ranges (both take typed dates). No native
  `<input type="date">`; its format follows the browser, not Norway.

### Data and filters

`DataTable` (+ `createColumns`, `TableSummary`), `FilterBar` with `RangeFilter`,
`DateRangeFilter`, `OptionsFilter`, `BooleanFilter`, `SavedViews`, and `defineList` /
`useListState` / `param` codecs for URL state.

### Feature models (`src/features`)

- `agreements/model.ts`: `AgreementRow` + `fromVipps` / `fromAvtaleGiro`. Pages never read the raw
  provider shapes.
- `distribution/model.ts`: `DistributionDraft`, validation (both levels sum to 100), API
  conversion. Unit tested.
- `review-queue`: `ReviewWorkbench` and the queue model over `reports.reviewQueue.*`.
- `search`: palette providers.

Removed from the first pass: the black sidebar and its notch animation and `sidebar-*` tokens,
the left-bar `PageHeader`, the filter drawer (`FilterPanel`, `FilterStats`), `KeyInfo`,
`StatCard`, `StatusBadge`, `Card`, `RadioGroup`, `Separator`, the `label-caps` utility, the
second-level greys (`subtle`, `secondary`), and the invented donation “status” in demo data (the
API has none).

## Writing

- English, sentence case, no exclamation marks, no emoji.
- Buttons are verbs, with the object or amount when it matters: “Register 500 kr”, “Stop
  agreement”, “Save changes”. Never “OK”, “Submit”, “Yes”.
- Confirmations are questions naming action and object (“Refund 500 kr to Kari Nordby?”), with
  consequences as a list.
- Errors: what went wrong in the person's terms, then what to do. Server validation messages are
  shown as written; generic failures map through `describeError`.
- Empty states say why it's empty and offer the next step. An action that produced nothing
  says so instead of succeeding silently (an empty report period downloads no file; an import
  with no payments in it is a warning, not "Everything was handled").
- Service messages written for developers ("Invalid ssn (failed fnr validation) …") are
  rewritten in the person's terms before they're shown (`plainMessage`).
- Payment methods are shown by their full name (`PaymentMethodName`), whichever form the API
  sent. Tax ids: fødselsnummer masked (`010190 •••••`), organization numbers in full
  (`maskSsn`). Truncated text has the whole value in its tooltip.
- Numbers and dates are Norwegian (`1 234 kr`, `24.10.2026`, `nb-NO`); words follow the UI
  language (month names, “2 days ago”).
- Shared copy lives in `src/lib/strings.ts` so a later translation swaps one module. No i18n
  library yet.

## Accessibility commitments

- WCAG 2.1 AA in both themes: text contrast ≥4.5:1, control outlines and focus ≥3:1. Checked by
  `pnpm test:a11y` (axe) on every `/design` page and key states.
- Everything works with the keyboard; focus is always visible (2 px accent ring); lists use a
  roving tab stop so Tab moves between regions, not through 1 000 rows.
- Every control has an accessible name (`label` prop or `Field`); icon buttons have
  `aria-label`. Status is never colour alone (dot + word).
- Live regions announce list ranges, distribution totals and review progress.
- Skip link to content; landmarks for nav, main, search, preview.
- Reduced motion respected globally.
- Manual checks before shipping a feature page: keyboard-only pass, VoiceOver pass of the main
  flow, 200 % zoom, narrow viewport.

## Stability tooling

```
pnpm typecheck          API types + router + app + tests
npm test                   Vitest unit tests (src/**/*.test.ts[x])
pnpm test:visual        Playwright screenshots of /design: 9 pages × light/dark × desktop/narrow + interaction states
pnpm test:visual:update accept intended changes (look at the diff in playwright-report first)
pnpm test:a11y          axe on every /design page and state, both themes
pnpm test:interaction   keyboard, history and loading behaviour (layout shift) with a stubbed API
```

Demo data in `src/design-system/fake-data.ts` is typed with `RouterOutputs`, so an API change
that breaks a template breaks the build. Visual baselines are per platform; CI should use the
Playwright Docker image with its own linux baselines.
