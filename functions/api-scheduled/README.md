# api-scheduled

Dispatcher that Cloud Scheduler calls (as `api-scheduled@`, OIDC) with `?type=ocr|avtalegiro|avtalegiroretry|vippsrecurring|auth0check|followup|mailchimp|adoveo`.
It fetches an Auth0 client-credentials token and calls the matching `/scheduled/*` endpoint on effektapi.
`type=adoveo` logs in to Adoveo with headless Chrome (puppeteer) and forwards a token to the fundraiser crawler.

Recovered on 2026-10-23 from the deployed source (it was previously deployed from the console). Deploy with `./deploy.sh`.
