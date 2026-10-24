# dmarc-report

Reads DMARC aggregate reports sent to `dmarc@gieffektivt.no` (a Domeneshop mailbox, read over IMAP) and posts to Slack.

- `?mode=daily`: parses new reports in `INBOX`, posts an alert listing any mail claiming our domains that failed DMARC, then moves the reports to `Processed`. Messages without a readable report go to `Unparsed`.
- `?mode=weekly`: posts a per-sender summary (Google Workspace, MailerSend, HubSpot, Other) of the reports archived in the last 7 days.

The DMARC record's `rua` must point at `mailto:dmarc@gieffektivt.no`. Known senders are recognised in `report.js` by DKIM selector or SPF domain; add new senders there.

Runs as `sa-dmarc-report`, which can only read the `dmarc-mailbox-password` and `dmarc-slack-webhook` secrets. Cloud Scheduler jobs `dmarc-report-daily` and `dmarc-report-weekly` call it with OIDC as `api-scheduled@`.

Deploy with `./deploy.sh`. Test with `npm test`.
