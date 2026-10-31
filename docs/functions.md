# Cloud Functions

Small functions under [`functions/`](../functions), each deployed on its own. Run the commands below in the function's folder.

Each function is a package of the pnpm workspace, with `lint`, `format` and (where there are tests) `test` like the apps. `./deploy.sh` copies the function with `pnpm deploy --prod` into a temporary folder that has a lockfile for just its production dependencies, and deploys that folder; Cloud Build installs the dependencies from it with pnpm.

## api-scheduled

Dispatcher that Cloud Scheduler calls (as `api-scheduled@`, OIDC) with `?type=ocr|avtalegiro|avtalegiro_retry|vipps|vipps_sync|vipps_charges|auth0check|followup|mailchimp`.
It fetches an Auth0 client-credentials token and calls the matching `/scheduled/*` endpoint on effektapi.

Recovered on 2026-10-23 from the deployed source (it was previously deployed from the console). Deploy with `./deploy.sh`.

### AvtaleGiro retry (`avtalegiro_retry`)

The claims job (`/scheduled/avtalegiro`, 10:00) uploads one claims file (`DIRREM<today>.<due date>.<shipment ID>`) per due date to the Mastercard Payment Services (MPS) SFTP `/Inbound` folder. MPS puts a receipt for each file in the same folder, named after the transmission number in the file's start record, which is our shipment ID padded to 7 digits:

- `KV.GODKJENT.F0000651.D<date>.T<time>.K<customer unit>.html`: accepted
- `KV.AVVIST.F0000651...`: rejected, MPS did not process the file

If the upload fails, the claims job logs it in Import_logs as `AvtaleGiro - Upload failed` with the shipment ID.

The retry (`/scheduled/avtalegiro/retry`, 11:00, 12:00 and 13:00) looks at today's shipments for each due date (code: `apps/api/src/custom_modules/avtalegiro/receipts.ts`):

| Receipts for the date's shipments                                                 | What happens                                                                         | `path`     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| Any shipment accepted                                                             | Nothing                                                                              | `accepted` |
| No shipment recorded (nothing was sent)                                           | Claims sent                                                                          | `not-sent` |
| Every shipment rejected, or its upload failed and there is no receipt             | Shipments superseded, claims sent again                                              | `resend`   |
| No receipt yet, or unclear receipts (another kind, or both accepted and rejected) | Nothing sent; alert mailed to teknisk@; response 409, so the scheduler job fails too | `alert`    |

Every path except `accepted` is logged in Import_logs as `AvtaleGiro - Retry`; the response lists the path for each due date. Without a receipt MPS may just be slow, so the claims are not sent again: sending them again could charge donors twice.

**After an alert**: check the shipment with MPS. If it was accepted, do nothing (the next run sees the receipt). If MPS confirms it was rejected or never received, send it again before the 14:00 cutoff with an admin token:

```sh
curl -X POST -H "Authorization: Bearer <admin token>" \
  "https://data.gieffektivt.no/scheduled/avtalegiro/retry?date=<YYYY-MM-DD the shipment was sent>&resend=<shipment ID>[,<shipment ID>...]"
```

`resend` must name every not superseded shipment for the due date, and it never sends a shipment that has an accepted receipt.

## dmarc-report

Reads DMARC aggregate reports sent to `dmarc@gieffektivt.no` (a Domeneshop mailbox, read over IMAP) and posts to Slack.

- `?mode=daily`: parses new reports in `INBOX`, posts an alert listing any mail claiming our domains that failed DMARC, then moves the reports to `Processed`. Messages without a readable report go to `Unparsed`.
- `?mode=weekly`: posts a per-sender summary (Google Workspace, MailerSend, HubSpot, Mailchimp, Other) of the reports archived in the last 7 days.

The DMARC record's `rua` must point at `mailto:dmarc@gieffektivt.no`. Known senders are recognised in `report.js` by DKIM selector or SPF domain; add new senders there. Failure alerts show the DKIM and SPF results the reporter saw (a failed signature from our own domain means it was our mail, altered in transit), and label source IPs whose reverse DNS belongs to a known recipient-side mail filter (Avanan, Mimecast, Proofpoint, ...) in `GATEWAYS`.

Runs as `sa-dmarc-report`, which can only read the `dmarc-mailbox-password` and `dmarc-slack-webhook` secrets. Cloud Scheduler jobs `dmarc-report-daily` and `dmarc-report-weekly` call it with OIDC as `api-scheduled@`.

Deploy with `./deploy.sh`. Test with `pnpm test`.

## The old Min Side redirect (not a function)

`minside.gieffektivt.no/<urlcode>` is redirected to `https://data.gieffektivt.no/vipps/agreement/minside/<urlcode>`
by the load balancer itself (URL map `min-side-redirect`), with no backend behind it.
Vipps agreements store their `merchantAgreementUrl` on the old Min Side host, so existing agreements keep working.
