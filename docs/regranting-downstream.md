# Downstream regrants — design proposal

Status: **proposal, for review** (29 Oct 2026). Nothing here is built. Extends
[regranting.md](regranting.md), which is live.

## Goal

Today our ledger stops at the payee: "External funds (GiveWell TCF/AGF) are ordinary
recipients; our ledger stops at the payee" ([regranting.md](regranting.md), Own funds). But much
of what we pay doesn't go straight to the recipient. GiveWell receives money from us for TCF and
AGF, which it regrants by its own decision, and for AMF, Malaria Consortium, HKI, New Incentives,
END and others, which it forwards. This proposal records what the **intermediary payee** did with
each of our transfer lines, as it reports to us: to whom, how much and **when the money actually
reached the ultimate recipient**.

> 1 000 kr to TCF, March 2025 → our transfer to GiveWell 20.05.2025 → GiveWell reported that line
> as granted to Malaria Consortium (SMC, Chad) 43.75 %, AMF 26.25 %, … → your 1 000 kr: MC
> 437.50 kr, AMF 262.50 kr, …
>
> 1 000 kr to AMF, March 2025 → our transfer to GiveWell 20.05.2025 → forwarded by GiveWell to
> AMF 15.07.2025.

Used for recipient statements ("sent by us" vs "received by the recipient"), project pages (HKI's
Vitamin A Supplementation shows money that reached it via TCF), reporting and audits, all in the
admin. Donor-facing impact builds on it later, as a separate project.

## Principles

1. **Our balances don't change.** Nothing here is a ledger entry. A balance is what we owe a
   recipient, and it goes down when we pay the payee, as today. Proposals, validation, rounds,
   transfers and the FIFO composition are untouched. Onward records sit beside the ledger.
2. **The intermediary tells us; we record it.** GiveWell (and other intermediaries) report where
   our money went and when. Ops enters it by hand, with the report attached. We never estimate
   or spread amounts ourselves. The one exception is a clearly marked _assumed_ entry for old
   pass-through lines until GiveWell confirms them (see Backfill).
3. **Calculated where possible.** Whether a line still awaits a report is calculated from the
   line and its onward records; no "pending" rows are stored.
4. **Everything has an author and a source**: who entered it, when, and the intermediary's report.
5. **GiveWell first, general shape.** Any payee that forwards or regrants (a fiscal sponsor,
   GiveDirectly programmes, the DIV Fund) uses the same tables.

## Concepts

| Term                 | Meaning                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intermediary payee   | A row in `Payees` that doesn't keep what we send but forwards or regrants it: GiveWell. Every transfer line paid to it gets an onward status.                                                |
| Pass-through line    | A line to an intermediary payee whose recipient is the end recipient (AMF, MC, HKI, NI, END…). The intermediary is expected to forward it to the line's own recipient (and project, if any). |
| Regranting fund      | A recipient that the intermediary regrants by its own decision: TCF (ID 12, the Maximum Impact Fund before Sept 2022) and AGF (ID 15). A line to it can end up with many grantees.           |
| Onward allocation    | One record of the intermediary sending (part of) one of our transfer lines onward: target, amount, date. Several per line allowed (several grantees, or partial forwards).                   |
| Onward report        | One report or statement from the intermediary (a letter, an email, a forwarding statement). Can cover several of our transfers; documents attach to it.                                      |
| Awaiting report      | The part of a paid line to an intermediary payee that has no onward allocation yet. Calculated.                                                                                              |
| Ultimate grantee     | Who the money ended up with: one of our recipients (`Organizations`), or, for regranting funds, an outside grantee we've never funded (an AGF-funded RCT).                                   |
| Own fund (unchanged) | GEBF etc.: _our_ decision, recorded as `Fund_grants`, part of the ledger. A regranting fund is the opposite: a normal recipient whose money leaves our ledger when paid. The two never mix.  |

Lines paid to an ordinary payee (the recipient's own account; MC since it went direct in Aug 2026) need nothing: the money reached the recipient on our `paid_at`.

## Data model

New tables, `?` nullable. No existing table changes shape except one nullable column on
`Regrant_documents`.

| Table                 | Columns                                                                                                                                                                                                                    | Notes                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Intermediary_payees` | Payee_ID (PK, FK `Payees`), currency (default `USD`), notes?                                                                                                                                                               | Marks a payee as an intermediary. `currency`: what it usually forwards and reports in. A marker table rather than a column on `Payees`, like `Funds` marks own funds. |
| `Regranting_funds`    | Organization_ID (PK, FK `Organizations`), notes?                                                                                                                                                                           | Marks TCF and AGF: their lines can go to any grantee. A recipient can't be both an own fund and a regranting fund.                                                    |
| `External_grantees`   | ID, name (unique), country?, url?, notes?, created_by, created_at                                                                                                                                                          | Only grantees that are **not** our recipients (AGF's one-off grantees). Never shown in donor-facing lists or the widget.                                              |
| `Onward_reports`      | ID, Payee_ID (FK `Intermediary_payees`), reported_at, reference?, notes?, created_by, created_at                                                                                                                           | One statement from the intermediary. GiveWell often confirms several months of forwarding at once: one report, many allocations across several of our transfers.      |
| `Onward_allocations`  | ID, Transfer_line_ID, kind, basis, Organization_ID?, External_grantee_ID?, Project_ID?, currency, amount_foreign?, amount_nok, forwarded_at, Report_ID?, purpose?, note?, created_by, created_at, updated_by?, updated_at? | See below.                                                                                                                                                            |
| `Regrant_documents`   | + Onward_report_ID?                                                                                                                                                                                                        | The intermediary's report or letter (Drive PDF, email). Still exactly one parent.                                                                                     |

`Onward_allocations` columns:

- `kind`: `grant` (money sent to a target) or `retained` (the intermediary kept it: processing
  fees, FX loss; no target, note required).
- `basis`: `reported` (from a report; `Report_ID` set) or `assumed` (backfill only, see below).
- Target, exactly one for `grant`: `Organization_ID` (one of our recipients) or
  `External_grantee_ID`. `Project_ID` only with `Organization_ID`, and the project must belong to
  it (HKI → Vitamin A Supplementation).
- `currency` + `amount_foreign` as the intermediary reports; `amount_nok` is the share of _our_
  transfer line (see Amounts).
- `forwarded_at`: when the intermediary sent the money to the target (for a TCF grant: when it
  paid the grant, or the grant date if that's all it reports). This is the "received by
  recipient" date.

### Grantees: recommendation

Every target that is one of our recipients is an `Organizations` row, referenced directly;
`External_grantees` holds only the rest. Pass-through targets are always our recipients, and TCF
mostly grants to them too (AMF, MC, HKI, NI), so this avoids two identities for the same charity
and lets recipient and project pages query one column. The alternatives are worse:
`External_grantees` for everyone (with a link back to `Organizations`) duplicates every recipient;
adding AGF grantees to `Organizations` puts them in donor-facing queries and under its name
constraints (45 characters, unique 10-character `abbriv`). If an external grantee later becomes a
recipient, its allocations are re-pointed to the new `Organizations` row and the grantee deleted.

### Onward status of a line (calculated)

For each **paid** transfer line whose transfer's payee is in `Intermediary_payees`:

```
reported   = Σ amount_nok of its allocations with basis = reported
assumed    = Σ amount_nok of its allocations with basis = assumed
awaiting   = line amount_nok − reported − assumed
```

Status: _awaiting report_ (nothing entered), _partly forwarded_, _forwarded_ (awaiting = 0,
some assumed: _forwarded (assumed)_). Lines to other payees have no onward status.

No "pending" row is created per line. For a pass-through line the transfer card prefills the
expected allocation (target = the line's recipient and project, full amount, our transfer's
currency) so ops only enters the date (and amount, if it differs) and picks the report. A stored
pending row would have to be kept in step with lines and adds nothing the calculation doesn't
give.

### Amounts

- **Our transfer paid in the reported currency** (usually USD, with `fx_rate` on the transfer):
  ops enters `amount_foreign`; `amount_nok = amount_foreign × fx_rate` of our transfer, so NOK
  shares are of what we paid, not at a later rate.
- **Our transfer paid in NOK, or forwarded in another currency** (GiveWell paying MC in GBP): ops
  enters `amount_nok` directly as the share of our line, plus `amount_foreign` for the record. The
  admin warns on the currency mismatch.
- **Partial forwards:** several allocations on one line with different `forwarded_at`; the rest
  stays awaiting.
- **Batches:** one GiveWell forward covering several of our transfers is one `Onward_report` with
  one allocation per line of ours, all with the same `forwarded_at`.
- **Rounding:** when a line's allocations cover all of it, NOK amounts are rounded with the
  existing `apportion` so they add up to the line exactly.

### Validation

- The line is paid and its transfer's payee is an intermediary (error).
- Σ `amount_nok` of a line's allocations ≤ the line (error). If the transfer has
  `amount_foreign`, Σ reported `amount_foreign` ≤ the line's foreign amount
  (`amount_nok / fx_rate`), within rounding (warning).
- `grant` has exactly one target; `retained` has none and a note (error).
- Pass-through line (recipient not in `Regranting_funds`): target is the line's own recipient
  (warning if not, e.g. GiveWell redirected money from a charity that lost top-charity status;
  the note must explain).
- `forwarded_at` before our transfer's `paid_at` (warning).
- Currency differs from the transfer's (warning: enter NOK directly).
- Project belongs to the target organisation (error). `assumed` only on pass-through lines, with
  target = the line's recipient (error).

Onward records document what someone else did; they can be added, edited and removed after the
round is paid, like documents, and never lock or reopen the round.

## Worked example (GiveWell, 2025; figures invented)

Round "Regular Q1 2025", paid 20.05.2025. Its transfer to payee GiveWell is in USD at `fx_rate`
10.50:

| Line                    |       NOK |        USD |
| ----------------------- | --------: | ---------: |
| TCF                     | 1 200 000 | 114 285.71 |
| AMF                     |   420 000 |  40 000.00 |
| HKI (Vitamin A project) |   210 000 |  20 000.00 |

**Pass-through.** GiveWell's forwarding statement of 20.07.2025 (one `Onward_report`, which also
covers the AMF line of our February transfer) says it sent AMF 40 000 USD on 15.07.2025 and HKI
15 000 USD on 15.07.2025. A second statement says HKI got the remaining 5 000 USD on 01.09.2025.

| Line | Target          | Forwarded  |    USD |     NOK | Status after                      |
| ---- | --------------- | ---------- | -----: | ------: | --------------------------------- |
| AMF  | AMF             | 15.07.2025 | 40 000 | 420 000 | forwarded                         |
| HKI  | HKI · Vitamin A | 15.07.2025 | 15 000 | 157 500 | partly forwarded (52 500 waiting) |
| HKI  | HKI · Vitamin A | 01.09.2025 |  5 000 |  52 500 | forwarded                         |

**Regranting fund.** In August 2025 GiveWell reports how our TCF line was granted:

| Target             | Project (ours)            | Granted    |       USD |        NOK |
| ------------------ | ------------------------- | ---------- | --------: | ---------: |
| Malaria Consortium | SMC expansion, Chad       | 30.06.2025 | 50 000.00 |    525 000 |
| AMF                | –                         | 30.06.2025 | 30 000.00 |    315 000 |
| HKI                | Vitamin A Supplementation | 30.06.2025 | 15 000.00 |    157 500 |
| New Incentives     | –                         | 30.06.2025 | 10 000.00 |    105 000 |
| Awaiting report    |                           |            |  9 285.71 | **97 500** |

HKI's Vitamin A project page then shows: direct via GiveWell 210 000 kr (sent 20.05.2025,
received 15.07 and 01.09.2025) and via GiveWell TCF 157 500 kr (granted 30.06.2025).

## Data sources

- **Primary: the intermediary's reports**, entered by hand and attached to an `Onward_report`.
  We should ask GiveWell for a regular forwarding statement per transfer (open question 2).
- **Reference only:** GiveWell's public pages (the Top Charities Fund grant table at
  https://www.givewell.org/top-charities-fund, the All Grants Fund page and the grants database
  linked from https://www.givewell.org/research/all-grants) help ops name grantees and link
  write-ups. Nothing is imported or derived from them.

## Effects on tracing and reporting

### Admin

- **Transfer card** (round page): for a paid transfer to an intermediary payee, each line shows its
  onward status and allocations; "Confirm forwarded" (prefilled for pass-through lines), "Add
  grant" (regranting funds), "Add retained". Reports and their documents are picked or created
  inline. The existing composition (which donations the line contained) is unchanged.
- **Recipient statement:** each transfer line shows "sent by us" (`paid_at`, to which payee) and,
  via an intermediary, "received" (`forwarded_at`, or _awaiting report_). Money a recipient got
  through a regranting fund (AMF via TCF) appears in a separate block, outside the running balance.
- **Project page:** the same two dates per line, and a _Via regranting funds_ section.
- **Awaiting report** list: paid lines to intermediary payees with something awaiting, oldest
  first, grouped by payee, to chase GiveWell. Assumed amounts listed separately.
- **Onward reports** page: reports per payee, their allocations and documents.

### Donation trace

The forward trace is now uniform for every recipient:

1. donation → its allocation per recipient (the `Regrant_allocations` view);
2. allocation → the transfer line(s) that took it under the existing FIFO rule;
3. line → reached the recipient on `paid_at` (ordinary payee), or → its onward allocations
   (intermediary payee): target and `forwarded_at`, or _awaiting report_.

**The only pro-rata step is inside our own line**: the donor's share of the line (step 2) times
the line's reported split (step 3). A donation that was 1 000 kr of the 1 200 000 kr TCF line
above went 437.50 kr to MC, 262.50 kr to AMF, 131.25 kr to HKI, 87.50 kr to NI, and 81.25 kr is
awaiting report. A donation in the HKI line reached HKI 75 % on 15.07 and 25 % on 01.09.2025. We
never spread one line's money over another line's report. Nothing is stored per donation. Admin
only ("Where did it go?" on a donation); donor-facing is a later, separate project.

### Reporting

- **"Given to charities" is unchanged** (direct allocations + fund grants, as paid by us).
- **New: by ultimate grantee and date received.** Each line via an intermediary is replaced by its
  onward allocations plus _retained_, _assumed_ and _awaiting report_ rows, so it always sums to
  the same total as the existing report. Never add the two together: that double counts.

### Is the ledger still unchanged?

Yes. A balance answers "what do we still owe this recipient", which ends when we pay the payee,
as agreed in regranting.md; the bank reconciliation and the accounts follow our payments, not
GiveWell's. Forwarding dates answer a different question ("when did it arrive") and are reported
beside the ledger. We assume GiveWell covers transaction costs; if a report shows it retained
something and that should ever be made good by us, that is an
ordinary `fee` or `correction` adjustment in a later round, decided by people, not created by the
onward records.

## Backfill

Onward records hang off transfer lines. Transfer history for 2016–2021 is now in prod and 2022
onwards is being added, so backfill can follow it.

Scope (decided): **every line paid via GiveWell from 2019 onwards**, pass-through and regranting
fund lines alike.

- **Pass-through lines:** where a GiveWell statement exists, enter it as `reported`. Otherwise a
  bulk action creates one `assumed` allocation per line: target = the line's recipient (and
  project), the full amount, `forwarded_at` = our `paid_at` unless better information exists,
  note "assumed forwarded in full; no report found".
- **Regranting fund lines (TCF/AGF):** only `reported` allocations. Without a report the line stays
  _awaiting report_; assuming TCF grantees would be inventing GiveWell's decisions.

`assumed` allocations:

- are allowed only on pass-through lines, with target = the line's recipient;
- show as _assumed_ everywhere in the admin (statements, trace, the ultimate-grantee report, the
  Awaiting report list, where they are listed separately);
- are replaced (deleted and re-entered as `reported`, linked to the report) when GiveWell confirms
  the exact data.

## What does not change

- Balances, the `Regrant_allocations` view, proposals, validation, round lifecycle, approvals.
- `Regrant_transfers`, `Regrant_transfer_lines`, adjustments, own funds, fund grants, holds, the
  FIFO composition and balance breakdown.
- `Organizations`, `Payees`, `Organization_payees`, distributions and donor-facing recipient
  lists. AGF grantees are not added as recipients.
- Tax receipts and the "given to charities" figures.
- TCF and AGF remain ordinary recipients that donors choose and we pay.

## Decisions (29 Oct 2026)

1. **Assumed entries: yes.** Old pass-through lines are filled with reasonable data until GiveWell
   confirms exact figures: forwarded in full, `forwarded_at` = our `paid_at` unless better
   information exists. Always marked `assumed` and replaceable.
2. **GiveWell covers transaction costs.** Pass-through forwards are recorded in full by default.
   The `retained` kind stays for when a report shows GiveWell kept something; no `retained` row is
   ever created by assumption.
3. **Backfill is comprehensive:** every line paid via GiveWell from 2019 onwards. Transfer history
   2016–2021 is in prod; 2022 onwards is being added.
4. **Admin only for now.** The first build is about getting the data and the model right.
   Donor-facing trace and received dates are a later, separate project.

## Phases

1. **MVP (admin).** Tables; mark GiveWell as an intermediary payee and TCF/AGF as regranting
   funds; onward status and entry on the transfer card (prefilled pass-through confirmation,
   grants, retained), onward reports with documents; the Awaiting report list.
2. **Backfill.** Bulk `assumed` allocations for pass-through lines via GiveWell from 2019, then
   GiveWell's statements entered as `reported` as they are found or received, following the
   transfer history import (2016–2021 now, 2022 onwards as it lands).
3. **Statements, projects, reports.** Sent/received dates on recipient statements and project
   pages, _Via regranting funds_ sections, the ultimate-grantee report (CSV), and the donation
   forward trace in the admin.

**Later, separate project (out of scope for the first build):** donor-facing trace and received
dates (Min Side, annual impact summary).

## Open questions

1. **Grantees.** Target is `Organizations` for our recipients and `External_grantees` only for the
   rest (recommended), or one grantee table for all?
2. **GiveWell statements.** Can GiveWell send a regular forwarding statement per transfer (date and
   USD per recipient) and a regranting report for TCF/AGF lines? What do we already have, to
   replace assumed entries?
3. **Redirected pass-through.** If GiveWell forwards a pass-through line to someone other than the
   line's recipient: warning with note (proposed), or error?
4. **Rounding.** `apportion` so NOK shares add up to the line exactly (proposed), or round each
   `amount_foreign × fx_rate` on its own and show a few øre of remainder?
