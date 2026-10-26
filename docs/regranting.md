# Regranting system — design

Status: **proposed** (26 Oct 2026). Replaces the _Tildelinger_ tab in Samlefila.
Visual sketch with mockups: https://claude.ai/artifact/Hm2Q88zTDLXMM4CtFUH1zn

## Goal

Work out what each recipient is owed directly from the donation database, and let
people decide only what gets paid, when, to whom, and for which project. The sheet's
hand-kept carry-forward ("Gjenstående til deling" → "Ikke overført") goes away:
balances are calculated.

## Principles

1. **The donation database is the source of truth.** Reconciling donations against
   the bank happens in the donation database, as today. The regranting system has no
   reconciliation step of its own. If a donation is corrected after a round, the
   recipient's balance changes and the next round pays (or withholds) the difference.
2. **Balances are calculated, never typed.** A balance is the sum of ledger entries.
3. **Paid rounds are never edited.** Mistakes in a paid transfer are fixed with a
   linked correction entry in a later round.
4. **Everything has an author and a reason.** Adjustments, fund grants and round
   approvals record who did it and why.
5. **Built in the admin panel**, backed by new routes and DAO modules in
   `effekt-backend` and new tables in the existing MySQL database. No existing table
   changes shape.

## Concepts

| Term          | Meaning                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Recipient     | A row in `Organizations`. What donors choose.                                                                             |
| Payee         | Who we actually send money to. One payee can cover several recipients (GiveWell pays for TCF, AGF, AMF, MC, HKI, NI).     |
| Project       | A specific project at one recipient. Optional on every outgoing line; empty means unrestricted.                           |
| Allocation    | The part of one donation that goes to one recipient. Read from the donation tables.                                       |
| Round         | One regranting decision: a cutoff date, a set of transfers, an approval.                                                  |
| Transfer      | One real bank transaction to one payee. Split into transfer lines.                                                        |
| Transfer line | The part of a transfer that belongs to one recipient, optionally one project.                                             |
| Adjustment    | A typed, signed entry with a reason: opening balance, fee, correction, reallocation, fronted amount.                      |
| Own fund      | A recipient that Gi Effektivt itself distributes (e.g. `GEBF`). Never paid directly; its money moves through fund grants. |
| Fund grant    | An internal entry, decided during a round, moving money from an own fund to recipients/projects. Sums to zero.            |

## Balance

Balances are kept per **(recipient, project)**, where project may be empty (unrestricted).

```
balance(org, project, t) =
    Σ opening adjustments
  + Σ allocations              (project = empty; donations only allocate unrestricted)
  + Σ fund grant lines in       (to this org/project)
  − Σ fund grant lines out      (only for own funds)
  − Σ transfer lines
  ± Σ other adjustments
  — all entries dated ≤ t
```

## Data model

New tables. `?` marks nullable columns.

### Allocations (view, not stored)

`Regrant_allocations` is a view over `Donations` → `Distributions` →
`Distribution_cause_areas` → `Distribution_cause_area_organizations`:

```sql
SELECT d.ID AS Donation_ID,
       dcao.Organization_ID,
       d.sum_confirmed * dca.Percentage_share / 100 * dcao.Percentage_share / 100 AS amount,
       d.timestamp_confirmed
FROM Donations d
JOIN Distribution_cause_areas dca ON dca.Distribution_KID = d.KID_fordeling
JOIN Distribution_cause_area_organizations dcao ON dcao.Distribution_cause_area_ID = dca.ID
WHERE d.Payment_ID NOT IN (15, 16) -- Influenced and AMF direkte never pass through our accounts
```

This is the same calculation as `getMonthlyAggregateByOrganization` (the current
Sheets export), except that Drift is _not_ filtered out: Drift is a recipient with its
own balance, paid to the operating account, and AMF direkte (payment 16, 2018–2021) is
excluded as well — the historical sheet never regranted it.

Notes from the historical reconciliation (Oct 2026):

- `Donations.Meta_owner_ID` 2 ("EA Norge") is in practice EA Giverportal money. EA Giverportal
  donations from 2022 (51 rows, 31,934 kr) are being moved from `Funds_donations` into
  `Donations` as owner 2, 100% TCF (how they were regranted), and the table retired. Owners 2 and
  3 are the same legal entity for tax; owner 2 only marks a donation as given to EA Norway.
- 2021 EA Giverportal donations (151 donations, 16 donors, 139,543 kr) exist only as one lump
  donation (74426, owner 3). They should be split into individual owner-2 donations.
- Money that was received but paid out by someone else is still inflow. Record the payment as a
  transfer with an external payer instead of excluding the donations, so recipient history and
  impact figures stay correct. Example: FEM donations until March 2024 were held and paid by
  EA Norway from its own FEM account.
- Splits are archived, not edited: when a recurring agreement's split changes, past donations move
  to a new KID with the old split (`AvtaleGiro_replaced_distributions`). Splits must never be
  updated in place with SQL, or history changes retroactively (this happened once, on
  2025-04-15, for standard-split KIDs).

### Tables

| Table                     | Columns                                                                                                                                                                    | Notes                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Payees`                  | ID, name, currency, bank_account, iban?, swift?, wallet?, payment_reference_template?, is_active                                                                           |                                                                                                                                                                                                                                |
| `Organization_payees`     | Organization_ID, Payee_ID, valid_from, valid_to?                                                                                                                           | Dated, because routing changes (MC went direct in Aug 2026).                                                                                                                                                                   |
| `Projects`                | ID, Organization_ID, name, description?, country?, start_date?, end_date?, status (proposed / active / completed / cancelled), agreement_ref?, report_due?, documents_url? | Used for project reports, audits and due diligence.                                                                                                                                                                            |
| `Regrant_rounds`          | ID, name, kind, cutoff, status, created_by, created_at, approved_by?, approved_at?, paid_at?                                                                               | `kind`: `regular`, `fund_grant`, `extraordinary`, `major_donor`. `status`: `draft` → `approved` → `paid`.                                                                                                                      |
| `Regrant_round_balances`  | Round_ID, Organization_ID, Project_ID?, balance_at_cutoff, included_direct                                                                                                 | Snapshot written at approval: what the decision was based on.                                                                                                                                                                  |
| `Regrant_transfers`       | ID, Round_ID, Payee_ID, amount_nok, currency, amount_foreign?, fx_rate?, bank_fee?, paid_at?, bank_ref?, paid_by                                                           | One per real bank transaction. `paid_by`: `foundation` (default) or `external` (e.g. EA Norway paying FEM directly before March 2024); external transfers don't appear in the foundation's bank reconciliation.                |
| `Regrant_transfer_lines`  | ID, Transfer_ID, Organization_ID, Project_ID?, amount_nok                                                                                                                  | Several lines per recipient allowed (one per project + one unrestricted).                                                                                                                                                      |
| `Regrant_adjustments`     | ID, Organization_ID, Project_ID?, amount, type, reason, effective_at, Round_ID?, linked_transfer_ID?, linked_donation_ID?, document_ref?, created_by, created_at           | `type`: `opening`, `fee`, `correction`, `reallocation`, `fronted`, `own_funds` (money the foundation adds from its own funds, e.g. 50,000 kr to GiveWell in April 2020 by board decision). `document_ref` points to the bilag. |
| `Funds`                   | Organization_ID, max_hold_days?                                                                                                                                            | Marks an own fund.                                                                                                                                                                                                             |
| `Fund_grants`             | ID, Fund_ID, Round_ID, rationale, approved_by?, approved_at?                                                                                                               | Decided inside a round. Rationale is required.                                                                                                                                                                                 |
| `Fund_grant_lines`        | ID, Fund_grant_ID, Organization_ID, Project_ID?, amount                                                                                                                    | Several lines per recipient allowed.                                                                                                                                                                                           |
| `Regrant_holds`           | Organization_ID, Project_ID?, reason, until?                                                                                                                               | Optional. Excluded from proposals while active.                                                                                                                                                                                |
| `Fund_grant_attributions` | Fund_grant_ID, Donation_ID, Organization_ID, amount                                                                                                                        | **Nice to have.** Only needed for donor tracing.                                                                                                                                                                               |

## Rounds

### Lifecycle

| Status     | What happens                                                                                                                  | Who                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `draft`    | Pick kind and cutoff. The system proposes amounts. People edit lines, add fund grants and projects, add transfers.            | Ops                  |
| `approved` | A second person approves. Balances are snapshotted; lines are locked. Payment instructions and grant letters can be produced. | Approver (≠ creator) |
| `paid`     | Actual paid date, FX rate, foreign amount, bank fee and bank reference are entered per transfer. Ledger entries take effect.  | Ops                  |

There is no `reconciled` status. Reconciliation is done on the donation data.

### Proposal rules

1. For each recipient in scope, propose paying its unrestricted balance at the cutoff
   plus every project balance.
2. **Round kind sets the default for direct donations:**
   - `regular`: direct (unrestricted) balances are included.
   - `fund_grant`: only fund-granted amounts are included; direct balances stay for the
     next regular round.
   - Each recipient has an _Include direct donations_ switch that overrides the default.
3. Recipients are grouped by payee (using `Organization_payees` valid at the cutoff).
   One transfer per payee and currency.
4. Anything not paid stays in the balance. No carry-over row is stored.
5. Balances under an active hold are shown but proposed as 0.

### Validation before approval

- No own fund appears in a transfer line.
- Fund grants don't exceed the fund's balance at the cutoff.
- Every fund grant has a rationale.
- Each transfer's lines sum to its `amount_nok`.
- Projects on lines belong to the line's recipient.
- Warnings, not errors: negative balances, recipients without a payee, balances in
  "Unassigned".

## Own funds

- A donation to an own fund is allocated 100% to the fund. The donation's distribution
  is never rewritten to the fund's eventual split.
- Own funds have **no fixed split**. In each round the team chooses recipients, projects
  and amounts, and writes a rationale. The fund grant is approved with the round.
- A fund grant writes balanced entries: fund −X, recipients/projects +X.
- Whatever isn't granted stays in the fund. `max_hold_days` (optional) flags money that
  has waited too long.
- Fund grants can happen off the regular schedule using a `fund_grant` round.
- Fund-to-fund grants are not allowed in the first version.
- External funds (GiveWell TCF/AGF) are ordinary recipients; our ledger stops at the payee.
- Reporting: "given to charities" = direct allocations + fund grants. A fund's inflow is
  reported as donor intent, and its unspent balance separately with its age.

## Projects

- A project belongs to one recipient.
- Donations always allocate to the unrestricted balance. Money reaches a project
  balance only through a fund grant line or by earmarking part of an unrestricted
  balance in a round.
- A transfer can carry several lines for the same recipient: one unrestricted plus one
  per project.
- The project page lists every transfer and fund grant line for the project, the
  agreement reference and report deadlines.

## How the sheet's special cases map

| In the sheet                                            | In the system                                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Ikke overført mottaker i denne tildelingen"            | Not stored. It is the balance after the round.                                                                                                                                    |
| Major-donor rounds (DSN Aug 2026, Miracle Feet, CS/AMI) | A `major_donor` round. Paying before the donation is confirmed is a `fronted` adjustment linked to the expected donation; the balance goes negative until the allocation arrives. |
| One transfer for many recipients; EUR/BTC transfers     | One transfer with currency, FX rate and foreign amount; lines in NOK.                                                                                                             |
| Recipient fees ("Gebyr mottaker"), Vipps/PayPal fees    | `fee` adjustments (see open decisions).                                                                                                                                           |
| "Korrigering forrige overføring"                        | Donation errors: fixed in the database. Transfer errors: a `correction` adjustment linked to the transfer.                                                                        |
| Facebook donations without a split                      | Shown as "Unassigned" until the donation's split is set in the database.                                                                                                          |
| GD UNR / "GiveDirectly prosjekt og Unrestricted"        | Lines to GiveDirectly with and without a `Project_ID`.                                                                                                                            |
| Drift / "Effekt-overføres-til-driftskonto"              | Drift is a recipient whose transfers go to the operating account.                                                                                                                 |
| Deactivated recipients, replaced distributions          | Handled in the database (`Replaced_old_organizations`). `reallocation` adjustments only for decisions outside the donation data.                                                  |
| Payment_ID 15                                           | Never allocated.                                                                                                                                                                  |

## Migration and backfill

Approach (to be confirmed by the historical comparison):

1. Choose a start cutoff: the end of the last completed round.
2. Load one `opening` adjustment per recipient equal to the sheet's carry-over at that
   cutoff.
3. Optionally import historical transfers from the sheet's "faktisk overført" rows as
   `paid` rounds marked `imported`, so recipient statements go back further.
4. Run one or two rounds in parallel with the sheet before retiring it.

The historical comparison (DB vs. Samlefila vs. Tildelinger) decides how far back
transfers can be imported with balances that agree with the database.

What the reconciliation has shown so far (Oct 2026; full report linked from the PR):

- Monthly inflow per recipient in Samlefila's year tabs agrees with the DB within 0.15% in
  every year 2019–2026. Most remaining differences are explained (DB corrections after the
  sheet's import, Giverportal money in `Funds_donations`, a split overwritten in place).
- Tildelinger's "Fra 2018" row is an opening balance into 2019. Transfers before 2019 exist
  only in the accounting bilag (Drive, per year).
- 2020 transfers match the bank bilag to the øre.
- Rebuilding balances as DB inflow − Tildelinger transfers gives the same result as the
  sheet for all but six recipients. The known adjustments that must be entered when
  importing: `own_funds` +50,000 TCF (April 2020); TCF/AGF moves from the split corrections;
  SCI 6,786 (Nov 2021) and AGF 2,500 (Jan–May 2022) that the sheet never allocated; FEM
  2,114,170 (2023 – Mar 2024) as an `external` transfer paid by EA Norway (confirm with EAN).
- Fixed in the DB on 26 Oct 2026: archive KIDs 002691643488541 and 002767649428283 (donors 2691
  and 2767, Dec 2021–Dec 2024) were set back from AGF to TCF, as they were paid.

## Screens (admin panel)

- **Balances**: one row per recipient (expandable to projects): balance, inflow since
  last round, last transfer.
- **Round builder**: as in the mockup. Fund grants (step 1), payments by payee (step 2).
- **Round history**: rounds with snapshot, transfers and grant letters.
- **Recipient statement**: all entries for a recipient over a period.
- **Project page / project report**.
- **Donation trace** — nice to have.

## Phases

1. Allocation view, opening balances, Balances page (read-only). Compare with the sheet
   for one round.
2. Rounds, payees and transfers. Run alongside the sheet for one regular round.
3. Adjustments, own funds, projects, fronted amounts. Retire the sheet.
4. Outputs: grant letters, payment files, statements, project reports. Donation
   tracing after that.

## Open decisions

- Are fees taken from the recipient's balance or paid by operations? (Current practice: recipients
  receive the gross amount; fees are covered by the operations account. In 2024–26 fees were about
  40% of operations inflow.)
- Should the 2016–2018 transfer history be imported from the accounting bilag? (Samlefila only has
  an opening balance into 2019.)
- Allocation date: `timestamp_confirmed` or registration date (matters near cutoffs for
  AvtaleGiro and late imports)?
- Who approves rounds and fund grants? Same person allowed for both?
- Automatic hold for small balances (e.g. < 10 000 kr)?
- How far back to import transfer history?
- Maximum time money may stay in an own fund?
- Should GD MB, GDCSF, GD UNR stay separate recipients or become GiveDirectly projects?
- What is "Annet" (`Organizations.ID = 18`) used for, and where does its money go?
