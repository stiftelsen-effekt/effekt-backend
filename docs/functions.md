# Cloud Functions

Small functions under [`functions/`](../functions), each deployed on its own. Run the commands below in the function's folder.

## api-scheduled

Dispatcher that Cloud Scheduler calls (as `api-scheduled@`, OIDC) with `?type=ocr|avtalegiro|avtalegiro_retry|vipps|vipps_sync|vipps_charges|auth0check|followup|mailchimp`.
It fetches an Auth0 client-credentials token and calls the matching `/scheduled/*` endpoint on effektapi.

Recovered on 2026-10-23 from the deployed source (it was previously deployed from the console). Deploy with `./deploy.sh`.

## dmarc-report

Reads DMARC aggregate reports sent to `dmarc@gieffektivt.no` (a Domeneshop mailbox, read over IMAP) and posts to Slack.

- `?mode=daily`: parses new reports in `INBOX`, posts an alert listing any mail claiming our domains that failed DMARC, then moves the reports to `Processed`. Messages without a readable report go to `Unparsed`.
- `?mode=weekly`: posts a per-sender summary (Google Workspace, MailerSend, HubSpot, Mailchimp, Other) of the reports archived in the last 7 days.

The DMARC record's `rua` must point at `mailto:dmarc@gieffektivt.no`. Known senders are recognised in `report.js` by DKIM selector or SPF domain; add new senders there. Failure alerts show the DKIM and SPF results the reporter saw (a failed signature from our own domain means it was our mail, altered in transit), and label source IPs whose reverse DNS belongs to a known recipient-side mail filter (Avanan, Mimecast, Proofpoint, ...) in `GATEWAYS`.

Runs as `sa-dmarc-report`, which can only read the `dmarc-mailbox-password` and `dmarc-slack-webhook` secrets. Cloud Scheduler jobs `dmarc-report-daily` and `dmarc-report-weekly` call it with OIDC as `api-scheduled@`.

Deploy with `./deploy.sh`. Test with `npm test`.

## The old Min Side redirect (not a function)

`minside.gieffektivt.no/<urlcode>` is redirected to `https://data.gieffektivt.no/vipps/agreement/minside/<urlcode>`
by the load balancer itself (URL map `min-side-redirect`), with no backend behind it.
Vipps agreements store their `merchantAgreementUrl` on the old Min Side host, so existing agreements keep working.
