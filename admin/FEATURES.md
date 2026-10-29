# What the admin must let people do

Functional scope of the admin, carried over from the old effekt-admin. Users are the small ops /
donor-relations team at Gi Effektivt (Norway), working with donations, recurring payment agreements
and tax data every day. Accuracy with money matters more than speed, but they repeat the same tasks
many times a day. Agreements are Vipps + AvtaleGiro; currency is NOK. Adoveo is discontinued. The
Swedish organisation runs on its own system; Swedish features are out of scope.

## Jobs

- **Find anything fast**: a donor by name/email/id, a donation by id, a KID, an agreement id, then
  see everything about it (⌘K).
- **Donors**: list + filter (name, email, id, registered / donation / last-donation date ranges, total
  sum range, donation count range, fundraiser behaviour, newsletter, organizations, referral types) +
  stats + CSV export. Donor detail: contact info (inline edit name, email, newsletter, trash), totals
  (incl. excluding operations), yearly donations by organization, donations, distributions (KIDs),
  agreements, tax units, referral answers. Merge a donor into another. Create a donor.
- **Tax units**: per donor (ssn/orgnr, name, donations, sum, yearly deductions); create (server
  validates fødselsnummer/orgnr), edit, archive with optional transfer of this year's
  donations to another unit.
- **Donations**: list + filter (date range, amount with histogram, id, fundraiser id, donor, KID,
  payment methods, tax unit type, organizations) + stats + export. Detail: sum, timestamp, method,
  external ref, data owner, KID, distribution; edit all of those incl. distribution; delete; resend
  receipt (optional override email).
- **Distributions (KIDs)**: list + filter (KID, donor) + export; detail (donor, tax unit, shares,
  donations using it); create.
- **Donation intents**: what a donor said they'd give in the widget (amount, method, KID) and
  whether it arrived (awaiting / received / not received after 30 days, the follow-up job's rule),
  with the matched first donation and reminders sent. List under Money in (filter by status,
  method, date, new donors only); a callout on the donor page for unpaid intents (a warning when
  it's the donor's first payment) and an Intents tab; intents on the KID page; a Home item for new
  donors waiting on a first bank/AvtaleGiro payment.
- **Registering money** (the most important ops flow):
  - Import a payment report per source: Vipps, bank OCR, bank (custom), Facebook. Choose data
    owner. Result: inserted / ignored / sent to
    review.
  - **Review queue** (server-side, shared by the team): unmatched transactions with reason + raw
    transaction; register (prefilled form: KID or new distribution) or ignore, reopen.
  - Register a single donation manually (KID or new distribution, sum, date, method, external ref,
    data owner, send receipt), also from the donor page on one of the donor's own KIDs.
  - Transaction report for a date range + payment methods.
- **Agreements**: one list across providers (`agreements.list`), plus per-provider detail. Vipps
  and AvtaleGiro: amount, status, charge day, KID, start, distribution, payments; edit amount,
  charge day, status, distribution. Vipps: charges (+refund), matching rules. AvtaleGiro: daily
  check (expected vs received vs missing). Cancelled agreements (`agreements.cancelled`): newest
  cancellation first, with the donor's other active agreement, donation stats and the reason
  given; summary of count, share with another active agreement and top reasons.
- **Fundraisers**: list + filter + stats; detail; create for a donor.
- **Settings**: cause areas, organizations per cause area, referral types — create, edit,
  activate/deactivate, ordering, standard split percentages (must sum to 100 within a group; warn
  when not). Data owners (read-only). Vipps matching rules.
- **Analysis**: an overview of what has been given to the recipients through time (excluding the
  Drift share), with open pledges shown on top and never mixed in, against the 200 MNOK
  milestone; this year's total. **Pledges** (tilsagn), decided gifts not received yet: add
  (amount + decision date, nothing about the giver), mark received (optionally linked to the
  donation), lower the amount after a partial payment, reopen, delete.
- **Records**: import log list (search file content) + entry detail (JSON result + raw file);
  reports.
- **Home**: what needs attention (review queue, missing AvtaleGiro payments, failed charges, recent
  imports) and headline numbers.

## Distributions

A KID maps to a donor + optional tax unit + split: per cause area a % share, either "standard
split" (organization shares from settings) or custom per-organization % shares; all sum to 100.
Distributions are edited in several places (donation edit, single registration, review queue,
agreements, create distribution) — always with the one distribution editor in
`src/features/distribution`.

## Old admin problems not to repeat

Double-click to open rows; filters hidden in a drawer; three input styles; a second palette on
newer pages; emoji toasts; Courier numbers; mixed Norwegian/English; dead links; no keyboard
support; review queue lost on reload.
