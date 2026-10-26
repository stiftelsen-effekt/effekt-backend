# Admin design system

The admin is a dense, calm tool for a small ops team that handles donations, agreements and tax
data every day. It is used for hours at a time, the same jobs are repeated many times a day, and
mistakes cost money. Everything below follows from that.

Live reference: run `npm run dev` and open `/design` (works without the API or a login).

## Principles

1. **Money is never ambiguous.** One way to show amounts, dates and ids. Anything that moves money
   is explicit, confirmed with the amount in the button, and its result is visible.
2. **Quiet until it matters.** Ink on paper. Colour is reserved for state: green flows, amber
   waits, red needs you. A screen with nothing wrong has almost no colour.
3. **Find, then act.** ⌘K finds any donor, donation, KID or agreement. Lists filter in place and
   keep their state in the URL. Rows peek with one click; the full page is one key away.
4. **Built for the hundredth time.** Keyboard paths for frequent actions, a compact density,
   flows that remember where you were.
5. **One concept, one component.** Agreements are one model across Vipps, AvtaleGiro and
   AutoGiro. Distributions have one editor. Statuses have one vocabulary. Pages come from four
   templates.
6. **Say what happened.** Plain English, sentence case, verbs on buttons. Errors say what went
   wrong and what to do next.

## What changed from the old admin, and why

| Old                                                  | New                                                                           | Why                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Black sidebar, notch on the active item              | Paper-coloured sidebar, active item as a raised white tab with an accent icon | The sidebar was the loudest thing on every screen; the content should be.          |
| Page title with a thick left bar                     | Display-face title, breadcrumbs above, a meta line of facts below             | The bar carried no information; breadcrumbs and facts do.                          |
| Black filter drawer on the right                     | Inline filter bar: search, chips, “Add filter”, saved views; URL-backed       | Filters were hidden and unshareable. Chips show what is applied at a glance.       |
| Double-click a row to open                           | Click/Space peeks, Enter opens, ⌘-click new tab, j/k moves                    | Double-click is undiscoverable and slow; peeking keeps your place in the list.     |
| Vipps, AvtaleGiro, AutoGiro as three unrelated lists | One Agreements list and model with a type filter                              | The job (“what does this donor give monthly?”) doesn't care about the provider.    |
| Pages by table (Register, Reports, Logs…)            | IA by job (below)                                                             | People think “money came in” not “Register”.                                       |
| Review queue lost on reload                          | Persistent queue, worked one item at a time with a prefilled form             | It was the most fragile part of the most important flow.                           |
| Norwegian and English mixed                          | English UI throughout; product names (KID, AvtaleGiro, Vipps, KU65) kept      | NO and SE share one admin; English is the team's common language.                  |
| Courier numbers, NOK hard-coded                      | Tabular figures in the brand face; currency from the build locale             | Columns line up; SE shows SEK.                                                     |
| Square, monochrome, pure black/white                 | Warm paper/ink neutrals, small radii, one accent, three state tones           | Pure #000 on #fff is tiring for long sessions; state needs colour to be scannable. |

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
  Agreements               Vipps + AvtaleGiro (NO) / AutoGiro (SE), one list
  Vipps charges      (NO)  charges, refunds
  AvtaleGiro check   (NO)  daily expected vs received
  Mandates, Shipments (SE)
Records
  Reports                  transaction report, KU65 (SE), agreement reports
  Import log
Settings                   cause areas & organizations (standard split), referral types, Vipps matching rules
```

The nav is data (`src/components/layout/nav.ts`), filtered by build locale, and also feeds ⌘K.

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
  const query = useQuery({
    ...trpc.donations.list.queryOptions({
      page: list.page - 1,
      limit: list.pageSize,
      sort: { id: list.sort.id, desc: list.sort.desc },
      filter: toApiFilter(list.filters), // map ranges/dates to the procedure's filter shape
    }),
    placeholderData: keepPreviousData,
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
  the query what it could be (digits → donor id, donation id, KID; `agr_` → Vipps agreement; text
  → name/email) and run in parallel. Add providers in `src/features/search/api-providers.ts`.
- **`/`** focuses the list search. **Filters** are chips; each opens its own editor. The URL holds
  the whole view (`?amount=100..500&method=4,8&sort=-sum&page=2`), so sharing a view is copying
  the address. **Saved views** name a combination per list (per browser).

### List → detail

Click or Space peeks (side panel on wide screens, sheet on narrow), j/k or ↑/↓ moves and the
peek follows, Enter opens the full page, ⌘/Ctrl-click opens it in a new tab, x selects, Esc
closes the peek. There is no double-click anywhere. Bulk actions appear in the table footer while
rows are selected.

### Editing, by risk

| Risk           | Examples                                              | Pattern                                                                                                      |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Low, one field | donor name, email, newsletter                         | `InlineEdit` / `Switch`; save on Enter/toggle; undo toast for toggles                                        |
| Several fields | settings, tax unit, matching rule                     | form + `UnsavedChangesBar` (explicit save, leaving asks first)                                               |
| Moves money    | donation amount/date/split, agreement amount          | form + `ConfirmDialog` showing before → after, amount in the button                                          |
| Irreversible   | delete donation, merge donors, stop agreement, refund | `ConfirmDialog tone="danger"` with `consequences`; `confirmText` (type the id/amount) for merges and refunds |

### Optimism, undo and feedback

- Optimistic only for cheap, reversible, non-financial changes (newsletter, name, saved views,
  skipping a review item). Everything in a confirmation waits for the server and shows
  `pending` on the button.
- Undo (`notify.undo`) only for actions done _without_ confirmation. Never both.
- `notify.success` for things that happened (short, past tense). `notify.error(error)` for
  failures outside dialogs; inside a dialog, keep it open and show the error in it. Section load
  failures use `ErrorState` in place with Try again. Persistent page-level messages use
  `Callout`.
- Loading: skeletons on first load, a thin accent progress line on refetch (rows dim slightly),
  `pending` on buttons. Never a full-page spinner.

### Imports and the review queue

`FlowPage` with Source → Upload → Result → Review. Unmatched transactions go into the review
queue store (`src/features/review-queue/store.ts`, localStorage, deduplicated by source +
transaction id), so they survive reloads and are counted in the nav. `ReviewWorkbench` shows one
item at a time: the raw transaction left, a registration form prefilled from it right
(existing KID or new distribution), Register (⌘Enter) or Skip (undoable). The same workbench
serves the Review queue page.

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

| Component                                                              | Use when                                                                                                                                         | Don't                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `Button`                                                               | Any action. `primary` once per view; `secondary` default; `ghost` in toolbars/rows; `danger` only to confirm irreversible actions; `link` inline | Use `danger` as a trigger; write “OK”       |
| `Input`, `Textarea`, `Select`, `Combobox`, `DateRangePicker`           | Form values; always inside `Field`                                                                                                               | Build a custom control                      |
| `Field`                                                                | Label + hint/error for any control (wires id/aria via context)                                                                                   | Put labels in placeholders                  |
| `Checkbox` / `Switch` / `SegmentedControl` / `ChoiceCards`             | independent options / immediate settings / 2–4 modes / a choice that needs a sentence each                                                       | Use a Switch inside a form that saves later |
| `Badge`                                                                | Category labels (agreement type, “Default”)                                                                                                      | Show lifecycle state (use `Status`)         |
| `Tabs`                                                                 | Related records of one parent                                                                                                                    | Top-level navigation                        |
| `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip` | Short focused task / via ConfirmDialog / navigation on narrow, peek / filter editors / secondary actions / icon-only buttons                     | Put long forms in dialogs                   |
| `Kbd`                                                                  | Keys in UI copy                                                                                                                                  |                                             |

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

### Data and filters

`DataTable` (+ `createColumns`, `TableSummary`), `FilterBar` with `RangeFilter`,
`DateRangeFilter`, `OptionsFilter`, `BooleanFilter`, `SavedViews`, and `defineList` /
`useListState` / `param` codecs for URL state.

### Feature models (`src/features`)

- `agreements/model.ts`: `AgreementRow` + `fromVipps` / `fromAvtaleGiro` / `fromAutoGiro`. Pages
  never read the raw provider shapes.
- `distribution/model.ts`: `DistributionDraft`, validation (both levels sum to 100), API
  conversion. Unit tested.
- `review-queue`: persistent queue store and `ReviewWorkbench`.
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
- Empty states say why it's empty and offer the next step.
- Numbers and dates follow the country (NO: `1 234 kr`, `24.10.2026`; SE: `1 234 kr`,
  `2026-10-24`); words follow the UI language (month names, “2 days ago”).
- Shared copy lives in `src/lib/strings.ts` so a later translation swaps one module. No i18n
  library yet.

## Accessibility commitments

- WCAG 2.1 AA in both themes: text contrast ≥4.5:1, control outlines and focus ≥3:1. Checked by
  `npm run test:a11y` (axe) on every `/design` page and key states.
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
npm run typecheck          API types + router + app + tests
npm test                   Vitest unit tests (src/**/*.test.ts[x])
npm run test:visual        Playwright screenshots of /design: 9 pages × light/dark × desktop/narrow + interaction states
npm run test:visual:update accept intended changes (look at the diff in playwright-report first)
npm run test:a11y          axe on every /design page and state, both themes
```

Demo data in `src/design-system/fake-data.ts` is typed with `RouterOutputs`, so an API change
that breaks a template breaks the build. Visual baselines are per platform; CI should use the
Playwright Docker image with its own linux baselines.
