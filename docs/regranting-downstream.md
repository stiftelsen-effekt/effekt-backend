# Downstream regrants — design proposal

Status: **proposal, for review** (29 Oct 2026). Nothing here is built. Extends
[regranting.md](regranting.md), which is live.

## Goal

Today our ledger stops at the payee: "External funds (GiveWell TCF/AGF) are ordinary
recipients; our ledger stops at the payee" ([regranting.md](regranting.md), Own funds). This
proposal records what an **intermediary fund** (first GiveWell's Top Charities Fund and All
Grants Fund) did with the money _after_ we paid it, as the intermediary reports it to us, so a
donation can be followed all the way to the ultimate grantee:

> 1 000 kr to TCF, March 2025 → our transfer to GiveWell 20.05.2025 → GiveWell reported that
> transfer as granted to Malaria Consortium (SMC, Chad) 50 %, AMF 25 %, … → your 1 000 kr:
> MC 500 kr, AMF 250 kr, …

Used for reporting, donor-facing impact, audits and the project pages (e.g. Helen Keller
International's Vitamin A Supplementation should show money that reached it via TCF, not only
what we paid directly).

## Principles

1. **Our balances don't change.** Nothing in this proposal is a ledger entry. Balances, proposals,
   validation, rounds and transfers are calculated exactly as today. A transfer line to TCF is
   final for our books when it is paid.
2. **The intermediary tells us; we record it.** GiveWell (and other intermediaries) report where
   our money went. Ops enters that report by hand against our transfer, with the report attached.
   We never estimate or spread amounts ourselves: what isn't reported is shown as not reported.
3. **Everything has an author and a source**, as in regranting.md: who entered it, when, and the
   intermediary's report or letter.
4. **GiveWell first, general shape.** GiveDirectly programmes or the DIV Fund use the same tables.

## Concepts

| Term                 | Meaning                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intermediary fund    | A recipient in `Organizations` that regrants money onward by its own decision: TCF (ID 12, the Maximum Impact Fund before Sept 2022) and AGF (ID 15). Paid through the payee GiveWell, like today.                |
| Ultimate grantee     | Whoever the intermediary granted our money to: AMF, Malaria Consortium, HKI, New Incentives, but also AGF grantees we've never funded (a research group running an RCT). May or may not be one of our recipients. |
| Project              | Our existing `Projects` row. An onward allocation can point at one (HKI → Vitamin A Supplementation), so the project page shows it.                                                                               |
| Onward allocation    | One line of the intermediary's report: this much of _our transfer line_ went to this grantee (and optionally project). Entered by hand.                                                                           |
| Awaiting report      | The part of a paid transfer line to an intermediary that has no onward allocation yet.                                                                                                                            |
| Own fund (unchanged) | GEBF etc.: _our_ decision, recorded as `Fund_grants`, part of the ledger and balances. An intermediary fund is the opposite: a normal recipient whose money leaves our ledger when paid. The two never mix.       |

Lines to AMF, MC, HKI and NI that we pay _through_ the payee GiveWell are already direct recipients
(GiveWell only passes them on). Only lines whose recipient is an intermediary fund (TCF, AGF) get
onward allocations (see open question 4).

## Data model

New tables, `?` nullable. No existing table changes shape except one nullable column on
`Regrant_documents`.

| Table                | Columns                                                                                                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Intermediary_funds` | Organization_ID (PK, FK `Organizations`), publisher, currency (default `USD`), notes?                                                                                              | Marks a recipient as an intermediary, like `Funds` marks an own fund. A recipient can't be both. `publisher` is shown in the UI ("awaiting report from GiveWell"); `currency` is what the intermediary usually reports in.                                                                                                                                                                                            |
| `External_grantees`  | ID, name (unique), Organization_ID?, country?, url?, notes?, created_by, created_at                                                                                                | Ultimate grantees. `Organization_ID` set when the grantee is also one of our recipients (AMF, MC, HKI, NI), so recipient and project pages can find it. AGF's one-off grantees live only here, so they never appear in donor-facing lists, the widget or under `Organizations`' constraints (45-char names, unique 10-char `abbriv`).                                                                                 |
| `Onward_allocations` | ID, Transfer_line_ID, Grantee_ID (FK `External_grantees`), Project_ID?, currency, amount_foreign?, amount_nok, allocated_at?, reported_at, purpose?, note?, created_by, created_at | One line of the intermediary's report against one of our transfer lines to an intermediary fund. `amount_foreign` + `currency` as reported (e.g. USD). `amount_nok` is the share of _our_ transfer line (see Amounts). `allocated_at`: when the intermediary granted it, if reported; `reported_at`: the date of the report. `Project_ID` only if the grantee has an `Organization_ID` and the project belongs to it. |
| `Regrant_documents`  | + Onward_allocation_ID?                                                                                                                                                            | Reuses the existing documents list for the intermediary's report or letter (Drive PDF, email). Still exactly one parent. A report covering a whole transfer can also be attached to the transfer (existing `Transfer_ID`).                                                                                                                                                                                            |

Why a separate grantee table, not `Organizations` with a flag: `Organizations` is donor-facing
(widget, distributions, standard split, tax and reporting queries all read it), its name and
abbreviation constraints don't fit many AGF grantees, and a flag would have to be added to every
query that lists recipients. `External_grantees.Organization_ID` gives the overlap (AMF is both)
without that risk. Projects stay ours: a project still belongs to one of our recipients, and an
onward allocation just points at it.

Allocations hang off the **transfer line**, not the transfer, because one GiveWell transfer
usually carries TCF, AGF and pass-through lines, and GiveWell reports per fund.

### Amounts

- **Our transfer paid in the reported currency** (e.g. USD, with `fx_rate` on the transfer):
  ops enters `amount_foreign`; `amount_nok = amount_foreign × fx_rate` of our transfer, so the NOK
  shares are of what we actually paid, not of today's rate.
- **Our transfer paid in NOK**, or reported in a currency other than the transfer's: ops enters
  `amount_nok` directly (and `amount_foreign` for the record, if reported). The admin warns on a
  currency mismatch and shows what share of the line each amount is.
- **Rounding:** when the onward allocations cover the whole line, the NOK amounts are rounded with
  the existing `apportion`, so they add up to the line amount exactly (open question 5).

### Validation

- The transfer line's recipient is an intermediary fund, and its round is `paid`.
- Σ `amount_nok` of a line's onward allocations ≤ the line's `amount_nok` (error). The rest is
  _awaiting report from {publisher}_.
- If the transfer has `amount_foreign`, Σ reported `amount_foreign` ≤ the line's foreign amount
  (`amount_nok / fx_rate`), within rounding (warning).
- Currency differs from the transfer's currency (warning: enter NOK directly).
- A project must belong to the grantee's organisation (error).

Onward allocations are documentation of what someone else did, not our money: they can be added,
edited and removed after the round is paid, like documents, and never lock or reopen the round.

## Worked example (TCF, 2025)

Round "Regular Q1 2025", cutoff 31.03.2025, paid 20.05.2025. Its transfer to payee GiveWell is in
USD at `fx_rate` 10.50 and has a TCF line of **1 200 000 kr** (114 285.71 USD). In August 2025
GiveWell writes that our May transfer to TCF was granted as below (figures invented). Ops enters
four onward allocations on the TCF line and attaches GiveWell's letter:

| Grantee            | Project (ours)            | Reported (USD) | × 10.50 = NOK |
| ------------------ | ------------------------- | -------------: | ------------: |
| Malaria Consortium | SMC expansion, Chad       |      50 000.00 |       525 000 |
| AMF                | –                         |      30 000.00 |       315 000 |
| HKI                | Vitamin A Supplementation |      15 000.00 |       157 500 |
| New Incentives     | –                         |      10 000.00 |       105 000 |
| **Reported**       |                           | **105 000.00** | **1 102 500** |
| Awaiting report    |                           |       9 285.71 |    **97 500** |

- The TCF line shows 1 102 500 kr reported, 97 500 kr awaiting report from GiveWell. When GiveWell
  reports the rest, ops adds a fifth line and the remainder goes to 0.
- Before August 2025 the whole line showed "1 200 000 kr awaiting report from GiveWell".
- HKI's Vitamin A project page lists "via GiveWell TCF: 157 500 kr (transfer 20.05.2025, reported
  August 2025)" next to our direct transfers, outside the project's balance.

## Data sources

- **Primary: the intermediary's report to us**, entered by hand and attached as a document.
  GiveWell is to tell us where our donations went; other intermediaries likewise.
- **Reference only:** GiveWell's public pages (the Top Charities Fund grant table at
  https://www.givewell.org/top-charities-fund, the All Grants Fund page and the grants database
  linked from https://www.givewell.org/research/all-grants) help ops name grantees and link grant
  write-ups (`url` on the grantee, `purpose` on the allocation). They are not imported and nothing
  is derived from them.

## Effects on tracing and reporting

### Admin

- **Transfer card** (round page): a paid line to an intermediary fund gets an _Onward_ section:
  its onward allocations, the documents, "Add allocation", and reported / awaiting report totals.
  The existing composition (which donations the line contained) is unchanged.
- **Project page:** a _Via intermediaries_ section listing onward allocations pointing at the
  project. Not part of the project's balance or statement total.
- **Recipient page** for a recipient that is also an external grantee (AMF): the same, as a
  separate block under the statement ("also received via GiveWell TCF: …").
- **Awaiting report** list: paid intermediary lines with a remainder, oldest first, to chase the
  intermediary.

### Donation trace

The existing trace runs backwards (transfer line → donations, FIFO). A donation-level forward
trace (nice-to-have in regranting.md) chains three steps:

1. donation → its allocation per recipient (the `Regrant_allocations` view);
2. allocation → the transfer line(s) that took it under the existing FIFO rule (a day's
   allocations can be split across two lines);
3. transfer line → its onward allocations, if the recipient is an intermediary fund.

**The only pro-rata step is inside our own line.** The donor's share of the line (step 2) is
multiplied by the reported split of that same line (step 3): a donation that was 1 000 kr of the
1 200 000 kr line above "went" 437.50 kr to MC, 262.50 kr to AMF, 131.25 kr to HKI, 87.50 kr to NI,
and 81.25 kr is awaiting report. We never spread one transfer's money over another transfer's
report. Nothing is stored per donation.

The admin gets it first (a "Where did it go?" panel on the donation); donor-facing text later, e.g.
"GiveWell reported that the transfer containing your donation went to: …".

### Reporting

- **"Given to charities" is unchanged** (direct allocations + fund grants). TCF and AGF stay
  recipients there.
- **New: by ultimate grantee.** A report where each intermediary line is replaced by its onward
  allocations plus an "awaiting report" row, so it always sums to the same total as the existing
  report. Never add the two together: that double counts.

## What does not change

- Balances, the `Regrant_allocations` view, proposals, validation, round lifecycle, approvals.
- `Regrant_transfers`, `Regrant_transfer_lines`, adjustments, own funds, fund grants, holds.
- The FIFO composition and balance breakdown.
- `Organizations`, `Payees`, `Organization_payees`, distributions and donor-facing recipient
  lists. AGF grantees are not added as recipients.
- Tax receipts and the "given to charities" figures.
- TCF and AGF remain ordinary recipients that donors choose and we pay.

## Phases

1. **MVP (admin).** Tables; mark TCF and AGF as intermediary funds; manual entry on the transfer
   card with documents; reported / awaiting report per line; the Awaiting report list.
2. **Projects and recipients.** _Via intermediaries_ sections on project and recipient pages;
   ultimate-grantee report (CSV). Backfill reports we already have, as far back as agreed.
3. **Donation forward trace** in the admin, then donor-facing (Min Side / annual impact summary).

## Open questions

1. **Grantee entity.** Separate `External_grantees` linked to `Organizations` (proposed), or reuse
   `Organizations` with a flag?
2. **Backfill.** How far back do we enter reports (TCF since our first transfer in 2016, or from
   2019 like the regranting opening balances)? Do we have past GiveWell reports to enter?
3. **Donor visibility.** Should the forward trace be shown to donors, and where (Min Side, annual
   summary, receipts)?
4. **Pass-through payments.** Do lines to AMF, MC, HKI and NI paid via the GiveWell payee need
   onward records too (e.g. to confirm GiveWell passed them on), or are they final as direct
   recipients (proposed)?
5. **Rounding.** When allocations cover a whole line, `apportion` so the NOK shares add up to the
   line exactly (proposed), or keep each `amount_foreign × fx_rate` rounded on its own and show a
   rounding remainder of a few øre?
