# Admin design system

Rules for the internal admin. Live reference: `pnpm dev`, then `/design` (no API or login needed).

## Principles

1. **Money is never ambiguous.** One way to show amounts, dates and ids. Money-moving actions are explicit,
   confirmed with the amount in the button, and show their result.
2. **Quiet until it matters.** Ink on paper. Colour is for state only: green flows, amber waits, red needs you.
3. **Find, then act.** ⌘K finds any donor, donation, KID or agreement. Lists filter in place, state in the URL.
   A row opens its record as a panel; panels stack.
4. **Built for the hundredth time.** Keyboard paths, compact density, flows that remember where you were.
5. **One concept, one component.** One agreement model across Vipps and AvtaleGiro; one distribution editor;
   one status vocabulary; four page templates.
6. **Say what happened.** Plain English, sentence case, verbs on buttons. Errors say what went wrong and what to do next.

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
  Cancelled agreements     newest cancellation first, reasons, donor stats
  Vipps charges            charges, refunds
  AvtaleGiro check         daily expected vs received
Regranting
  Balances                 what each recipient is owed (expand to projects) → recipient statement
  Rounds                   list → round builder: fund grants, payments by payee, approve, record payments
  Projects                 list → project page (facts, everything sent to it)
  Adjustments              ledger entries with a reason (corrections, fees, fronted …)
  Payees & funds           payees, dated routing, own funds, holds
Analysis
  Overview                 given through time with open pledges, progress to the 200 MNOK milestone
  Pledges                  decided gifts not received yet (tilsagn): add, mark received, change amount
Records
  Reports                  transaction report
  Import log
Settings                   cause areas & organizations (standard split), referral types, Vipps matching rules
```

Organise by job, not by table. The nav is data (`src/components/layout/nav.ts`) and also feeds ⌘K.

## Page templates

Build feature pages from these; don't lay out a page by hand.

| Template       | Use for             | Composition                                                                                                                            |
| -------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ListPage`     | Any list of records | `title`, `actions` (≤1 primary), `filters={<FilterBar>}`, `<DataTable>` with `summary`, `getRowHref`                                   |
| `DetailPage`   | One record          | `breadcrumbs`, `title`, `adornment` (status), `meta` (facts), `actions`, `stats`, `aside` (`DetailPanel`s), children = related records |
| `FlowPage`     | Multi-step jobs     | `steps`, `current`, `footer={<FlowFooter>}`, `width` narrow/wide; state in `usePersistentState`                                        |
| `SettingsPage` | Configuration       | `nav` of sections, `SettingsSection` children; explicit save with `UnsavedChangesBar`                                                  |
| `HomeView`     | Home only           | attention list, stats, chart, recent imports                                                                                           |

### Building a list page

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
  const listOptions = (page: number) =>
    trpc.donations.list.queryOptions({
      page: page - 1,
      limit: list.pageSize,
      sort: list.sortInput,
      filter: toApiFilter(list.filters),
    });
  const query = usePageQuery(listOptions(list.page), {
    prefetch: (data) => nextPage(list.page, data.pages, listOptions),
  });
  return (
    <ListPage
      title="Donations"
      actions={<Button variant="primary">Register donation</Button>}
      filters={
        <FilterBar list={list} searchPlaceholder="Donor, KID or donation ID">
          <OptionsFilter field="method" label="Payment method" options={methods} />
        </FilterBar>
      }
    >
      <DataTable
        label="Donations"
        columns={columns}
        data={query.data?.rows}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        {...list.tableState}
        getRowHref={(row) => `/donations/${row.id}`}
        pageHotkeys
      />
    </ListPage>
  );
}
```

`/design/list` and `/design/agreements` are complete versions with fake data.

## Interaction patterns

### Finding

- **⌘K** (also the sidebar box): one box for records and commands. Providers read the query (digits → donor id,
  donation id, KID, review item; `agr_…` or `VA_…` → Vipps agreement; text → donor name/email, review items by
  payer, message or reference) and run in parallel. Add providers in `src/features/search/api-providers.ts`.
- **`/`** focuses list search. Filters are chips, each with its own editor. The URL holds the whole view
  (`?amount=100..500&method=4,8&sort=-sum&page=2`). Saved views are per list, per browser.
- **History**: filter changes, sorting and paging are history entries; Back undoes one at a time and never leaves
  the list. Refining an applied search, and repeated changes to one filter (dragging a range), replace the entry.
- **Empty lists** (`ListEmpty`): no filters → "No charges yet" and why. Filters or search → "No results" and
  Clear all. Never "Nothing matches these filters" when none are set.

### List → detail

Panels live in `src/components/panels`.

- Click, Enter or Space opens the record's real route component as a panel from the right over most of the list;
  a 64–120 px strip of list stays visible. Full width on narrow screens.
- **Stacking:** a link or row that goes to another record, inside a panel, opens a panel on top; lower panels show as offset edges.
- Esc or Back closes the top panel. Clicking a lower edge or the strip closes everything above it.
- **Full page** goes to the record's route. **Close all** returns to the list as it was (scroll, cursor, marked row).
  ⌘/Ctrl- or middle-click opens a new tab. Never open records on double-click.
- x selects; bulk actions sit in the table footer.
- The stack is the `panel` search param (`?panel=donor:12,donation:345`), validated by the layout route; reload,
  Back/Forward and copied links keep it. Opening or closing a panel never refetches the list.
- A record kind is a line in `src/features/record-panels.ts` (route id, path, label). Read params with
  `useRecordParams(Route)` and search with `useRecordSearch(Route)`, not `Route.useParams()` / `useSearch()`.
  In a panel, search is local to the panel.
- Rows without a page (a charge, an adjustment) open a `RowDialog`.
- Motion: new panel slides 32 px and fades in (200 ms, `ease-out`); the one below scales to 0.98 under a dim;
  closing takes 140 ms. Panels already in the URL on load don't animate. Reduced motion: no movement.
- Focus moves to the new panel and returns on close. Only the top panel's single-key shortcuts are live (`HotkeyScope`).

### Responsive

- Narrow screens: panels full width; navigation in a `Sheet`; page gutter 16 px (wide: 24 px).
- Check a narrow viewport before shipping (visual tests run at 1440 and 390).

### Editing, by risk

| Risk           | Examples                                              | Pattern                                                                                                                          |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Low, one field | donor name, email, newsletter                         | `InlineEdit` / `Switch`; save on Enter/toggle; undo toast for toggles                                                            |
| Several fields | settings, tax unit, matching rule                     | form + `UnsavedChangesBar` (explicit save; leaving asks first). In a dialog, closing with changes asks first (`useDiscardGuard`) |
| Moves money    | donation amount/date/split, agreement amount          | form + `ConfirmDialog` showing before → after, amount in the button                                                              |
| Irreversible   | delete donation, merge donors, stop agreement, refund | `ConfirmDialog tone="danger"` with `consequences`; `confirmText` (type the id/amount) for merges and refunds                     |

### Optimism, undo and feedback

- Optimistic only for cheap, reversible, non-financial changes (newsletter, name, saved views, skipping a review item).
  Everything in a confirmation waits for the server, with `pending` on the button.
- Undo (`notify.undo`) only for actions done _without_ confirmation. Never both. Undoing is confirmed with a plain
  toast ("Change undone"), never another Undo.
- `notify.success`: short, past tense, at most one action toward what was just made ("Open donation").
  `notify.error(error)` outside dialogs; inside a dialog, keep it open and show the error there.
- Section load failures: `ErrorState` in place with Try again. A record that no longer exists (deleted, merged)
  gets `ErrorState` with `back` to its list. Persistent page messages: `Callout`.

### Loading

Loading is invisible when fast and calm when slow: nothing jumps or flashes, and what's on screen stays until its replacement is ready.

**Delays.** No indicator for work under 300 ms (`PENDING_DELAY_MS`, `--delay-pending`). Once shown, it stays at least
400 ms. `useDelayedFlag` drives the progress bar and dimming; skeletons get the same delay in CSS. Reduced motion: no
pulsing, a static progress line. Buttons are the exception: `pending` shows at once. Never a full-page spinner.

**Which indicator.**

| Situation                                          | What shows                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| First load of a page or section (no data yet)      | The real layout with placeholder values (below)                                 |
| Parameter changes: day, page, filter, sort, period | Current content dimmed (`Updating`, DataTable `isFetching`) + top progress line |
| Navigating to another page                         | Previous page stays, with top progress line, until the data is in (≤ 1 s)       |
| Background refetch (after a mutation, interval)    | Nothing, or rows dim slightly if it takes > 300 ms                              |
| Form or editor whose reference data is loading     | `Pending`: space reserved, top progress line, no fake fields                    |
| An action                                          | `pending` on its button                                                         |

**Keep previous data on parameter changes.** Queries whose input comes from the URL or local state use `usePageQuery`
(`src/lib/query.ts`): `keepPreviousData`, reports to the top progress line, `prefetch` for what's next. Plain
`useQuery` only for inputs fixed while the page is open. Never show a skeleton because `isPending` became true again
after a change; `isPlaceholderData` means "updating", so wrap the region in `<Updating active>`.

**Skeletons only on first load, from real components.** Never draw a layout from skeleton bars. Primitives render
their real structure with same-size placeholders:

- `DataTable isLoading`: placeholder rows from the real columns at the real row height (`meta.placeholder` sets a
  column's width; `cellPlaceholder` has the common ones). **Invisible**: lists show no skeletons; real rows fade in over them.
- `Stat pending` (label stays, value and hint reserved), `Property pending` (label stays), `TabsTrigger count={null}`,
  `AttentionList pending`.
- `SkeletonText` for a value inside a real heading, meta line or cell; its sample sets the size
  (`<SkeletonText>Firstname Lastname</SkeletonText>`).
- Charts (`BarChart data={undefined}`) and panels keep a fixed size and fade in. `Skeleton` only reserves such a box.
- A page that needs a first-load state (only on the app's first load or a slow navigation) renders its template
  with these, as the donor and AvtaleGiro pages do.

**Prefetch.** Links preload on hover and focus (`defaultPreload: "intent"`); rows with `getRowHref` do too, on hover and
when the cursor moves to them. Detail routes use a `loadPage` loader (`src/lib/route-data.ts`) that warms every query
the page shows. On preload or navigation it resolves when they're in, or after 1 s; on the app's first load and on
search-param changes it doesn't wait. A navigation that starts during a preload waits for it.

- Lists prefetch the next page; the AvtaleGiro check the previous, next and today; the review workbench the next and previous item.
- Queries are fresh for 30 s (`createQueryClient`). Mutations still invalidate what they change.
- A loader must not use `loaderDeps` for parameters the page steps through itself (the AvtaleGiro date): each step would wait.

**Reserve space for what arrives late.** Tab badge counts (`count={null}`), stat hint lines, footers, chart legends
(always shown), the nav review badge (right-aligned in its row), images (`width`/`height`). If an amount is unknown,
reserve last time's (Home's attention list keeps its row count). Content that appears sometimes goes below fixed-height
content, never above it.

`tests/interaction/loading.spec.ts` measures layout shift (CLS) on Home, the donors list, a donor and the AvtaleGiro
check against a slow stubbed API, and checks that changing the day shows no skeleton. Keep CLS under 0.02.

### Imports and the review queue

`FlowPage` with Source → Upload → Result → Review (`/import`). Unmatched transactions go to the server-side review queue
(`reports.reviewQueue.*`, shared by the team, deduplicated by source + transaction id), so nothing is lost on reload or on
another machine; the nav badge shows the open count.

`ReviewWorkbench` (`/import/review/$id`) shows one item: the raw transaction left, a registration form prefilled right
(existing KID or new distribution). **Register** (⌘Enter); **Skip** (moves on, changes nothing); **Ignore** with an
optional note (undoable; ignored items can be reopened). If someone else resolved the item first, say so and move on.

### Keyboard

| Keys                     | Action                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⌘K / Ctrl+K              | Search and commands (every page, common actions)                                                                                                    |
| ?                        | Shortcut help                                                                                                                                       |
| g, then a letter         | Go to: h home, d donors, f fundraisers, o donations, k KID, i import, r review queue, a agreements, c charges, b balances, l import log, s settings |
| /                        | Focus list search; ↓ from it returns to the rows                                                                                                    |
| j / k, ↑ / ↓, Home / End | Move the row cursor                                                                                                                                 |
| Enter / Space            | Open the row as a panel                                                                                                                             |
| x                        | Select row                                                                                                                                          |
| [ / ]                    | Previous / next page                                                                                                                                |
| j / k in a panel         | Swap the panel for the next / previous row's                                                                                                        |
| f in a panel             | Full page                                                                                                                                           |
| Esc                      | Close top panel, cancel edit (dialogs with changes ask)                                                                                             |
| ⌘Enter                   | Register (review), save (`UnsavedChangesBar`), submit a dialog's form or primary button                                                             |

Every page supports these. Single-key shortcuts are ignored while typing, in menus, or while any dialog or popover is
open (`useHotkey`). The list keys live in `DataTable` (`pageHotkeys` on the page's main table), not in pages; the ?
dialog is generated from `components/layout/shortcuts.ts` and the nav's `goKey`s, so add new shortcuts there.

**Rows arriving.** `DataTable` fades rows in while they settle 4 px into place (180 ms), staggered 10 ms per row, capped at
400 ms. It plays only when rows mount (first load, new page or filter); refetches and re-sorting reuse rows and don't replay it.
Transform and opacity only, so no layout shift; off under reduced motion. Don't add per-list animation.

## Tokens

All in `src/styles/app.css`. Tailwind's default palette, sizes, radii and shadows are removed. Components use the
semantic layer, never raw values.

- **Colour.** Warm neutral "paper" greys and near-black "ink"; never pure black on pure white.
  - Roles: `background` (content sheet), `canvas` (chrome), `muted`, `hover`/`pressed` (translucent, any surface),
    `foreground`, `muted-foreground` (6.7:1), `faint-foreground` (≥4.5:1: placeholders, icons), `border`,
    `border-strong`, `input` (≥3:1: control outlines).
  - **Primary is ink**, not blue. **Accent (blue)** only means interactive / you are here: links, focus rings, active
    nav icon, selection, open row, current step.
  - **Tones** `success` / `warning` / `danger` (+ `-subtle`) carry state and nothing else.
  - Dark mode is not inverted: warm near-blacks (#121211–#252422), off-white text, tones lightened for contrast.
    Every text pair meets WCAG AA in both themes (`test:a11y`).
- **Charts.** `chart-1…5`: ink, accent blue, ochre, teal, light grey (distinguishable in both themes and for common
  colour-vision deficiencies); largest series is ink. `chart-6…9` are softer 1–4. `chart-10…12` (violet, rose, olive;
  lighter in dark mode) and `chart-13…15` (softer 10–12) exist so every active organization can have its own colour.
  Organizations use 1–4, 10–12, then 6–9, 13–15; never `chart-5`, which is "Other".
- **Type.** ES Klarheit Grotesk everywhere; ES Klarheit Kurrent only for page titles (one brand moment per screen).
  Scale 12 / 13 / 14 / 16 / 20 / 26 / 32; body 14, tables and controls 13. Tabular lining figures for every number
  (`num`; `Money`, `Num`, `DateTime` apply it). Sentence case; no all-caps labels.
- **Space.** 4 px grid. Inside a component 4–8; between components 12–16; between sections 24–32.
- **Radii.** 2 (badges, kbd), 4 (controls), 6 (panels), 10 (dialogs, content sheet).
- **Elevation.** Borders separate. Only floating things (menus, dialogs, toasts) cast `shadow-overlay`; record panels `shadow-panel`.
- **Motion.** 100 / 160 / 240 ms, `ease-out`, only to show where something came from. Off with reduced motion.
- **Density.** `--row-h`, `--control-h`, `--cell-px`: comfortable (40/32/12) or compact (32/28/8) via `data-density` on
  `<html>`. Per-browser, set in the user menu and ⌘K (`src/lib/preferences.ts`, same store as the theme).

### Distributions

Organizations first. Gi Effektivt gives almost everything through Global Health, so a split is one bar of organizations,
each in its own colour, with name, share and amount beside it.

- **Colour is stored on the organization** (`Organizations.chart_color`, a palette token; set in Settings → Cause areas →
  edit organization, which shows who else uses each colour). Always colour an organization with `orgColor(org)`
  (`features/distribution/orgs.ts`): the stored token, or, only when none is stored, one derived from the id. Never
  reassign colours per view, even when two organizations shown together share one. Light grey only for "Other".
- Procedures that return organizations, `orgSplit` rows or per-organization totals include `chartColor`; pass it on.

- A cause area appears as a small group header only when it adds information: more than one is used, or the one used isn't Global Health.
- List cells use `OrgSparkline` (small bar; all organizations in the tooltip).
- Charts stack by organization, the long tail as "Other" (`orgChartSeries`).

## Components

Prop conventions: `variant` = visual weight; `tone` = meaning (neutral/accent/success/warning/danger); `size` = sm/md/lg;
`label` = accessible name; `value` + `onChange` (Radix controls: `onValueChange`); `pending` = an action is running.
Pass children, not config objects, where structure varies.

### Primitives (`src/components/ui`)

| Component                                                                 | Use when                                                                                                                                         | Don't                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `Button`                                                                  | Any action. `primary` once per view; `secondary` default; `ghost` in toolbars/rows; `danger` only to confirm irreversible actions; `link` inline | Use `danger` as a trigger; write "OK" |
| `Input`, `Textarea`, `Select`, `Combobox`, `DateInput`, `DateRangePicker` | Form values, always inside `Field`                                                                                                               | Build a custom control                |
| `Field`                                                                   | Label + hint/error for any control                                                                                                               | Put labels in placeholders            |
| `Checkbox` / `Switch` / `SegmentedControl` / `ChoiceCards`                | Independent options / immediate settings / 2–4 modes / a choice needing a sentence each                                                          | Switch in a form that saves later     |
| `Badge`                                                                   | Category labels (agreement type, "Default")                                                                                                      | Lifecycle state (use `Status`)        |
| `Tabs`                                                                    | Related records of one parent                                                                                                                    | Top-level navigation                  |
| `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip`    | Short focused task / via ConfirmDialog / navigation on narrow / filter editors / secondary actions / icon-only buttons                           | Long forms in dialogs                 |
| `Kbd`                                                                     | Keys in UI copy                                                                                                                                  |                                       |
| `Skeleton`, `SkeletonText`                                                | First-load placeholders inside real components; `Skeleton` only to reserve a fixed box                                                           | Page layouts from skeleton bars       |
| `Updating`, `Pending`, `ProgressBar`                                      | Kept data while the next loads / form still loading / top progress line                                                                          | Spinners                              |

### Domain (`src/components/domain`)

| Component                                                                                    | Use when                                                                                                                |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Money`, `Num`, `DateTime`                                                                   | Every amount, count, date. `DateTime` absolute in tables/forms, `relative` for activity; the other form in the tooltip  |
| `CopyValue`                                                                                  | Every id people copy: donor/donation id, KID, agreement id, external ref                                                |
| `Status` + `lib/status.ts`                                                                   | Lifecycle state. New catalogs go there: value → label, tone, meaning                                                    |
| `PropertyList` / `Property`                                                                  | Facts about one record                                                                                                  |
| `StatGroup` / `Stat`                                                                         | 2–5 headline numbers                                                                                                    |
| `Sparkline`                                                                                  | A monthly trend beside a `Stat` (`chart` prop): 96 × 32, no axes, running month dashed, hidden where the stat is narrow |
| `Callout`                                                                                    | A message tied to a place on the page                                                                                   |
| `EmptyState`, `ErrorState`                                                                   | Nothing to show / failed to load (with retry)                                                                           |
| `InlineEdit`                                                                                 | One low-risk field                                                                                                      |
| `ConfirmDialog`                                                                              | Irreversible or financial actions                                                                                       |
| `UnsavedChangesBar`                                                                          | Explicit-save forms (also blocks navigation while dirty)                                                                |
| `DistributionEditor`, `DistributionSummary`, `AllocationBar`, `PercentInput`, `OrgSparkline` | Every split, editing or reading                                                                                         |
| `AttentionList`                                                                              | Home, "what needs me"                                                                                                   |
| `FileDropzone`, `JsonViewer`                                                                 | Uploads, raw payloads                                                                                                   |

The API sends amounts as decimal strings. Pass them to `Money` / `formatMoney` as they are. For sums, averages,
comparisons and sorting use `src/lib/money.ts` (exact, in øre). `moneyToNumber` is only for charts, histograms and ratios.

### Money, numbers and dates

The formatters apply these, so pages never choose.

- **Money** has two precisions, chosen by context, never by value (`formatMoney` / `Money precision`):
  - **Exact** (default): two decimals: `1 500,00 kr`, `0,30 kr`, `0,00 kr`. Tables, record and detail fields,
    inputs, statements, confirmations, anything right-aligned.
  - **Whole** kroner, rounded: `1 500 kr`. Only for aggregates meant to be glanced at: `Stat` (default, value and hint),
    chart axes and tooltips, overview headlines (Home, Analysis). A statement's balances stay exact even in a `Stat`
    (`precision="exact"`).
  - Never mix the two within one table or column. A missing amount is `–` everywhere.
- **Money in inputs** (`formatMoneyInput` / `parseMoneyInput`): decimal comma, no grouping, two decimals (`1000,00`,
  `249,50`). `MoneyInput` rewrites a valid entry on blur. `1 000`, `1000.5` and `500 kr` are accepted. CSV exports keep their own formats.
- **Chart axes** compact from 1 000 up (`7,5k`, `15k`, `1,2M`); tooltips use whole kroner.
- **Dates and times** are Oslo time (`Europe/Oslo`), whatever the browser zone: `24.10.2026`, `24.10.2026 14:05`. A
  `YYYY-MM-DD` day from the API is that day. Filters and forms hold days as `YYYY-MM-DD` and send them as they are; the
  API reads a plain date as the whole Europe/Oslo day, inclusive, in every procedure. Never send a day as a UTC instant.
  Helpers: `src/lib/dates.ts`. CSV exports write Oslo local time (`2026-10-24 14:05:00`).
- **Date entry** is `dd.mm.yyyy`, typed or picked: `DateInput` for one day, `DateRangePicker` / the date filter for ranges.
  No native `<input type="date">`.

### Data and filters

`DataTable` (+ `createColumns`, `TableSummary`); `FilterBar` with `RangeFilter`, `DateRangeFilter`, `OptionsFilter`,
`BooleanFilter`, `SavedViews`; `defineList` / `useListState` / `param` codecs for URL state.

### Feature models (`src/features`)

- `agreements/model.ts`: `AgreementRow` + `fromVipps` / `fromAvtaleGiro`. Pages never read raw provider shapes.
- `distribution/model.ts`: `DistributionDraft`, validation (both levels sum to 100), API conversion. Unit tested.
- `review-queue`: `ReviewWorkbench` and the queue model over `reports.reviewQueue.*`. `search`: palette providers.

### Retired: don't reintroduce

The black sidebar and its notch, `sidebar-*` tokens, the left-bar `PageHeader`, the filter drawer (`FilterPanel`,
`FilterStats`), `KeyInfo`, `StatCard`, `StatusBadge`, `Card`, `RadioGroup`, `Separator`, the `label-caps` utility, and
the `subtle` and `secondary` greys. Demo data never invents a donation "status"; the API has none.

## Writing

- English UI; product names (KID, AvtaleGiro, Vipps) kept. Sentence case, no exclamation marks, no emoji.
- Buttons are verbs, with the object or amount when it matters: "Register 500 kr", "Stop agreement", "Save changes".
  Never "OK", "Submit", "Yes".
- Confirmations are questions naming action and object ("Refund 500 kr to Kari Nordby?"), consequences as a list.
- Errors: what went wrong in the person's terms, then what to do. Server validation messages are shown as written;
  generic failures map through `describeError`.
- Empty states say why and offer the next step. An action that produced nothing says so, not "succeeded" (an empty
  report period downloads no file; an import with no payments is a warning, not "Everything was handled").
- Developer-facing service messages ("Invalid ssn (failed fnr validation) …") are rewritten via `plainMessage` before display.
- Payment methods by full name (`PaymentMethodName`), whichever form the API sent. Fødselsnummer masked (`010190 •••••`); organization numbers in full
  (`maskSsn`). Truncated text has the whole value in its tooltip.
- Numbers and dates are Norwegian (`1 234 kr`, `24.10.2026`, `nb-NO`); words follow the UI language (month names, "2 days ago").
- Shared copy lives in `src/lib/strings.ts`, so a later translation swaps one module. No i18n library yet.

## Accessibility commitments

- WCAG 2.1 AA in both themes: text ≥4.5:1, control outlines and focus ≥3:1. Checked by `pnpm test:a11y` (axe).
- Everything works with the keyboard; focus is always visible (2 px accent ring). Lists use a roving tab stop, so Tab
  moves between regions, not through 1 000 rows.
- Every control has an accessible name (`label` or `Field`); icon buttons have `aria-label`. Status is never colour alone (dot + word).
- Live regions announce list ranges, distribution totals and review progress. Skip link; landmarks for nav, main, search, preview.
- Reduced motion is respected globally.
- Manual checks before shipping a feature page: keyboard-only pass, VoiceOver pass of the main flow, 200 % zoom, narrow viewport.

## Stability tooling

```
pnpm typecheck          API types + router + app + tests
npm test                   Vitest unit tests (src/**/*.test.ts[x])
pnpm test:visual        Playwright screenshots of /design: 9 pages × light/dark × desktop/narrow + interaction states
pnpm test:visual:update accept intended changes (look at the diff in playwright-report first)
pnpm test:a11y          axe on every /design page and state, both themes
pnpm test:interaction   keyboard, history and loading behaviour (layout shift) with a stubbed API
```

Demo data in `src/design-system/fake-data.ts` is typed with `RouterOutputs`, so an API change that breaks a template
breaks the build. Visual baselines are per platform; CI uses the Playwright Docker image with its own linux baselines.
