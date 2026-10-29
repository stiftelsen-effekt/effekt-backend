# Downstream regrants — design proposal

Status: **proposal, for review** (29 Oct 2026). Nothing here is built. Extends
[regranting.md](regranting.md), which is live.

## Goal

Today our ledger stops at the payee: "External funds (GiveWell TCF/AGF) are ordinary
recipients; our ledger stops at the payee" ([regranting.md](regranting.md), Own funds). This
proposal records what an **intermediary fund** (first GiveWell's Top Charities Fund and All
Grants Fund) does with the money _after_ we pay it, so a donation can be followed all the way to
the ultimate grantee:

> 1 000 kr to TCF, March 2025 → paid to GiveWell 20.05.2025 → GiveWell's TCF allocation for
> donations received April–June 2025 → Malaria Consortium (SMC, Chad) 445 kr, AMF 300 kr, …

Used for reporting, donor-facing impact, audits and the project pages (e.g. Helen Keller
International's Vitamin A Supplementation should show money that reached it via TCF, not only
what we paid directly).

## Principles

1. **Our balances don't change.** Nothing in this proposal is a ledger entry. Balances, proposals,
   validation, rounds and transfers are calculated exactly as today. A transfer line to TCF is
   final for our books when it is paid.
2. **Not our decision, so we record, not decide.** The intermediary decides. We copy what it
   publishes, with a source link, and never edit it into something it didn't say.
3. **Attribution is a convention, stated openly.** Money is fungible. Unless the intermediary
   tells us explicitly, our share of its grants is pro-rata by period, and every screen and
   donor-facing text says so.
4. **Calculated, not typed** (as in regranting.md). We store what the intermediary published and
   the few explicit overrides; our share is computed.
5. **GiveWell first, general shape.** GiveDirectly programmes or the DIV Fund later use the same
   tables with a different attribution method.

## Concepts

| Term                 | Meaning                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intermediary fund    | A recipient in `Organizations` that regrants money onward by its own decision: TCF (ID 12, the Maximum Impact Fund before Sept 2022) and AGF (ID 15). Paid through the payee GiveWell, like today.            |
| Ultimate grantee     | Whoever the intermediary grants to: AMF, Malaria Consortium, HKI, New Incentives, but also many AGF grantees we've never heard of (a research group running an RCT). May or may not be one of our recipients. |
| Project              | Our existing `Projects` row. An external grant can point at one (HKI → Vitamin A Supplementation), so the project page shows it.                                                                              |
| Allocation period    | A window of the intermediary's _incoming_ donations that it allocates together. GiveWell publishes these for TCF ("donations received April to June 2025").                                                   |
| External grant       | One grant the intermediary published: grantee, amount from the fund, period, purpose, source link.                                                                                                            |
| Attribution          | Our share of the external grants: which part of one of our transfer lines to an intermediary fund ended up with which grantee. Computed.                                                                      |
| Own fund (unchanged) | GEBF etc.: _our_ decision, recorded as `Fund_grants`, part of the ledger and balances. An intermediary fund is the opposite: a normal recipient whose money leaves our ledger when paid. The two never mix.   |

Note: lines to AMF, MC, HKI and NI that we pay _through_ the payee GiveWell are already direct
recipients (GiveWell only passes them on). They need nothing new. Only lines whose recipient is an
intermediary fund (TCF, AGF) are attributed onward.

## What GiveWell publishes

Researched on givewell.org (public pages only, Oct 2026):

- **TCF page** (https://www.givewell.org/top-charities-fund): a table of every TCF grant since
  2014 with _date approved_, _donations received_ (the allocation period, e.g. "April to June
  2025"), _amount_, _recipient(s)_ and a link to the grant write-up ("Grant page forthcoming"
  until it exists). Footnotes give the full grant size when TCF paid only part ("$8.9 million,
  part of a $10.4 million grant"). Example row: approved June 2025, donations received April–June
  2025, Malaria Consortium, SMC expansion in Chad, $8.9M from TCF. GiveWell grants 100 % of TCF
  donations (minus payment processor fees) and commits them within about six months; in recent
  years allocation has been roughly quarterly.
- **AGF page** (https://www.givewell.org/all-grants-fund): rolling grants, with a selected list
  (date, recipient, amount, location, purpose). It does **not** say which donations paid for which
  grant: there is no period mapping.
- **Grants database**: an Airtable view linked as "List of Grants" from
  https://www.givewell.org/research/all-grants (date, grantee, amount, location, purpose), and an
  impact spreadsheet for grants from 2020 onward linked from the TCF page. Whether these state the
  funding source (TCF / AGF / other) per grant needs checking before we rely on them for AGF.
- No API. Entry is manual or a paste/CSV import from those tables.

So TCF can be attributed by period with published data; AGF cannot, without a convention or
information from GiveWell (see AGF below).

## Data model

New tables, `?` nullable. No existing table changes shape except one nullable column on
`Regrant_documents`.

| Table                   | Columns                                                                                                                                                                | Notes                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Intermediary_funds`    | Organization_ID (PK, FK `Organizations`), publisher, currency (default `USD`), method, receipt_lag_days (default 7), source_url?, notes?                               | Marks a recipient as an intermediary, like `Funds` marks an own fund. A recipient can't be both. `method`: `period_share` (TCF), `window_share` (AGF, if agreed), `explicit_only` (attribute only what the intermediary tells us). `receipt_lag_days`: days between our `paid_at` and the intermediary counting the money as received.                                                         |
| `External_grantees`     | ID, name (unique), Organization_ID?, country?, url?, notes?, created_by, created_at                                                                                    | Ultimate grantees. `Organization_ID` set when the grantee is also one of our recipients (AMF, MC, HKI, NI), so recipient and project pages can find it. AGF's many one-off grantees live only here, so they never appear in donor-facing lists, the widget or `Organizations` constraints (45-char names, unique 10-char `abbriv`).                                                            |
| `External_periods`      | ID, Fund_ID (FK `Intermediary_funds`), donations_from, donations_to, status, fund_received?, currency, published_at?, source_url?, notes?, created_by, created_at      | One allocation period as the intermediary publishes it. Unique (Fund_ID, donations_from); periods of a fund don't overlap. `status`: `open` (nothing published), `partial` (some grants published), `complete` (we've entered all of it). `fund_received`: the fund's total intake for the period, only if published; makes unallocated money visible.                                         |
| `External_grants`       | ID, Period_ID, Grantee_ID (FK `External_grantees`), Project_ID?, amount_from_fund, grant_total?, approved_on, purpose?, location?, source_url?, created_by, created_at | One published grant, in the period's currency, as published. `amount_from_fund` is what the fund paid (the share we attribute against); `grant_total` the full grant when larger. `Project_ID` only if the grantee has an `Organization_ID` and the project belongs to it (validated). `approved_on` is the first day of the published month when only the month is given.                     |
| `External_attributions` | ID, Transfer_line_ID, Period_ID?, External_grant_ID?, amount_nok?, reason, created_by, created_at                                                                      | **Overrides only**, exactly one kind per row, enforced by the API. (a) `Period_ID` alone: count this line in that period instead of the one its date falls in (GiveWell received it late, or told us). (b) `External_grant_ID` + `amount_nok`: GiveWell said explicitly that this much of our money went to that grant. Reason required. Lines without overrides are attributed by the method. |
| `Regrant_documents`     | + External_period_ID?                                                                                                                                                  | Reuses the existing documents list: GiveWell's page snapshot (PDF/Drive), emails confirming an allocation. Still exactly one parent.                                                                                                                                                                                                                                                           |

Why a separate grantee table, not `Organizations` with a flag: `Organizations` is donor-facing
(widget, distributions, standard split, tax and reporting queries all read it), its name and
abbreviation constraints don't fit hundreds of AGF grantees, and a flag would have to be added to
every existing query that lists recipients. Linking `External_grantees.Organization_ID` gives the
overlap (AMF is both) without that risk. Projects stay ours: a project still belongs to one of our
recipients, and an external grant just points at it.

## Attribution

### Period share (TCF)

For each paid transfer line whose recipient is an intermediary fund with `method = period_share`:

1. **Period.** The line's period is its override (a), otherwise the fund's period containing
   `paid_at + receipt_lag_days`. No period entered yet → _awaiting publication_.
2. **Explicit first.** Override (b) rows for the line are taken as stated.
3. **Pro-rata for the rest.** The remainder `R` is shared over the period's grants by
   `amount_from_fund`:

   ```
   share(grant) = R × amount_from_fund(grant) / D
   D = fund_received            if published and ≥ Σ amount_from_fund
     = Σ amount_from_fund        otherwise
   ```

   When `D = fund_received`, the part `R × (1 − Σ amount_from_fund / fund_received)` is shown as
   _not allocated by GiveWell in this period_ (held, rolled over, processing fees).

4. **Status.** While the period is `open` or `partial`, whatever isn't attributed yet is shown as
   _awaiting GiveWell's allocation for {period}_, with the grants entered so far listed as
   "so far". Shares are only final once the period is `complete`.
5. **Rounding.** Shares are computed on exact decimals and rounded with the existing `apportion`
   so they add up to the line amount to the øre.

Shares are expressed in **NOK of our transfer line**: the attribution is a proportion, so no FX
rate is needed and the numbers always add up to what we paid. USD figures are shown beside them
only as context: if the transfer was paid in USD, `amount_foreign` × share; otherwise none. The
intermediary's own amounts are stored and shown in its currency, as published.

### Worked example (TCF, Q2 2025)

Figures other than the Malaria Consortium grant are invented for illustration.

- Round "Regular Q1 2025", cutoff 31.03.2025, paid 20.05.2025. Its transfer to payee GiveWell has
  a TCF line of **1 200 000 kr** (paid in USD, 114 286 USD at 10.50).
- `paid_at + 7 days` = 27.05.2025 → TCF period **April–June 2025**.
- GiveWell approved in June 2025 for that period (amounts from TCF):

  | Grantee            | Project (ours)            | From TCF (USD) |  Share | Our share (kr) |
  | ------------------ | ------------------------- | -------------: | -----: | -------------: |
  | Malaria Consortium | SMC expansion, Chad       |          8.9 M | 44.5 % |        534 000 |
  | AMF                | –                         |          6.0 M | 30.0 % |        360 000 |
  | HKI                | Vitamin A Supplementation |          3.1 M | 15.5 % |        186 000 |
  | New Incentives     | –                         |          2.0 M | 10.0 % |        120 000 |
  | **Total**          |                           |     **20.0 M** |        |  **1 200 000** |

- If GiveWell had also published `fund_received` = 22.0 M USD, each share would be divided by
  22.0 M instead and 109 091 kr (9.1 %) would show as not allocated in this period.
- Before GiveWell published (May–July 2025), the line showed "1 200 000 kr awaiting GiveWell's
  allocation for April–June 2025".
- HKI's Vitamin A project page then lists "via GiveWell TCF: 186 000 kr (April–June 2025, pro-rata
  share)" next to our direct transfers.

Timing: our quarterly round pays one to two months after its cutoff, GiveWell allocates the
quarter's money at or shortly after the quarter's end, and the write-up often follows later. A
donation can therefore take 6–9 months to reach a final ultimate grantee; the trace shows each
step's date.

### AGF

GiveWell doesn't publish which donations paid for which AGF grant. Options, to decide (open
question 4):

- **MVP: list only.** An AGF line shows "GiveWell's All Grants Fund made these grants in the 12
  months after receiving it" (list of grants, no amounts per line). Honest, cheap.
- **Window share.** `method = window_share`: periods are windows we define (e.g. calendar years),
  and our line is shared pro-rata over AGF grants approved in the window after receipt. Gives
  numbers but is our convention more than GiveWell's.
- **Ask GiveWell.** If GiveWell can give partner organisations a per-donor allocation, enter it as
  explicit attributions (`explicit_only`).

### Other intermediaries

Same tables. GiveDirectly programmes or the DIV Fund get an `Intermediary_funds` row, periods as
they report them, and usually `explicit_only` (they often tell partners where the money went).

## Data entry

- **Manual entry first.** Regranting → Intermediaries → TCF → new period: dates from GiveWell's
  "donations received" column, then grants pasted from the TCF table (tab-separated paste:
  grantee, amount, purpose, link), each grantee matched to an existing `External_grantees` row or
  created, optionally linked to one of our recipients/projects. Ops checks each row against the
  page before marking the period `complete`.
- **Documents.** Each period gets the GiveWell page URL as `source_url`, and a saved copy (PDF in
  the regranting Drive folder) as a `Regrant_documents` row, because GiveWell edits its pages
  (footnotes, "forthcoming" → write-up link).
- **Import later.** A CSV import from GiveWell's grants spreadsheet/Airtable export, if it proves to
  carry the funding source per grant. No scraping of givewell.org.
- **Backfill.** TCF periods only need entering back to our first transfer we want to trace; the
  TCF table goes back to 2014 (Maximum Impact Fund, same organisation ID 12).

## Effects on tracing and reporting

### Admin

- **Round page / composition.** A paid transfer line to an intermediary fund gets an _Onward_
  section: period, status, the attributed grants (with links), awaiting/unallocated parts. The
  existing composition (which donations the line contained) is unchanged; onward attribution is
  shown after it.
- **Project page.** A _Via intermediaries_ section: external grants pointing at the project and our
  attributed share, with period and status. Not part of the project's balance or statement total.
- **Recipient page** for a recipient that is also an external grantee (AMF): the same, as a
  separate block under the statement ("also received via GiveWell TCF: …").
- **Intermediaries page** (new): funds, periods with status, our lines per period and how much is
  still awaiting publication.

### Donation trace

The existing trace runs backwards (transfer line → donations, FIFO). A donation-level forward trace
(listed as nice-to-have in regranting.md) chains three steps:

1. donation → its allocations per recipient (the `Regrant_allocations` view);
2. allocation → the transfer line(s) that took it under the FIFO rule (a day's allocations can be
   split across two lines; the donation's share is apportioned the same way);
3. transfer line → onward attribution, if the recipient is an intermediary fund.

Each step is computed from existing data plus the new tables; nothing is stored per donation. The
admin gets it first (a "Where did it go?" panel on the donation). Donor-facing text, when we get
there, keeps the convention visible: "GiveWell allocated the Top Charities Fund money it received
April–June 2025 to: Malaria Consortium 44.5 %, AMF 30 %, … Your 1 000 kr counts proportionally."

### Reporting

- **"Given to charities" is unchanged** (direct allocations + fund grants). TCF and AGF stay
  recipients there.
- **New: by ultimate grantee.** A report where intermediary funds are replaced by their attributed
  grantees, plus "awaiting publication" and "not allocated by intermediary" rows, so it always sums
  to the same total as the existing report for the same period. Never add the two together: that
  double counts.

## What does not change

- Balances, the `Regrant_allocations` view, proposals, validation, round lifecycle, approvals.
- `Regrant_transfers`, `Regrant_transfer_lines`, adjustments, own funds, fund grants, holds.
- The FIFO composition and balance breakdown.
- `Organizations`, `Payees`, `Organization_payees`, distributions and donor-facing recipient
  lists. AGF grantees are not added as recipients.
- Tax receipts and the "given to charities" figures.
- TCF and AGF remain ordinary recipients that donors choose and we pay.

## Phases

1. **MVP (TCF, admin only).** Tables; Intermediaries page with manual period and grant entry
   (paste), documents; computed period-share attribution; _Onward_ section on paid TCF lines.
   Enter TCF periods for 2025–2026 and check the shares against GiveWell's table.
2. **Projects and recipients.** _Via intermediaries_ sections on project and recipient pages;
   ultimate-grantee report (CSV). Backfill TCF periods as far back as we want to report.
3. **Donation forward trace** in the admin, then donor-facing (Min Side / annual impact summary),
   with the wording agreed.
4. **AGF and other intermediaries** (method as decided), CSV import from GiveWell's grant data if it
   carries the funding source.

## Open questions

1. **Grantee entity.** Separate `External_grantees` linked to `Organizations` (proposed), or reuse
   `Organizations` with a flag?
2. **Convention.** Is pro-rata by GiveWell's period acceptable as _the_ attribution for reports and
   donor-facing statements, and how should the caveat be worded?
3. **Which date.** Our `paid_at` + a fixed lag (proposed, 7 days), or GiveWell's receipt date
   entered per transfer?
4. **AGF.** List only, a window share (which window?), or ask GiveWell for an explicit allocation?
5. **Freeze or compute.** Keep attributions always computed (proposed), or snapshot them when a
   period is marked `complete`, for audits, in case GiveWell later edits its table?
6. **GiveWell contact.** Can GiveWell give us a per-period statement of our own money (and of
   `fund_received`)? Our amounts are small relative to the fund, so pro-rata is likely all they can
   offer.
7. **Rollovers.** When GiveWell carries TCF money into a later period, show it as "not allocated"
   (proposed) or attribute it to the later period?
8. **Scope.** How far back to backfill (TCF since our first transfer in 2016, or since 2019 like the
   regranting opening balances)? Donor-facing at all, and where?
9. **Pass-through lines.** Confirm that lines to AMF, MC, HKI, NI paid via payee GiveWell are 100 %
   passed through and need no onward record.
