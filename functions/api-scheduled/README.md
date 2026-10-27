# api-scheduled

Dispatcher that Cloud Scheduler calls (as `api-scheduled@`, OIDC) with `?type=ocr|avtalegiro|avtalegiroretry|vippsrecurring|auth0check|followup|mailchimp`.
It fetches an Auth0 client-credentials token and calls the matching `/scheduled/*` endpoint on effektapi.

Recovered on 2026-10-23 from the deployed source (it was previously deployed from the console). Deploy with `./deploy.sh`.
