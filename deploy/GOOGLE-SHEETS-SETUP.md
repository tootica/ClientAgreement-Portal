# Google Sheets storage and Netlify hosting

The website now uses a private Google Sheet as its registration ledger. There is no SQLite database, persistent disk or service-account JSON requirement. Razorpay secrets and SMTP credentials stay in the Node.js backend. Google Apps Script accepts only signed server requests and uses a ScriptLock to serialize ledger updates.

## Connect your Sheet

Your selected Sheet: https://docs.google.com/spreadsheets/d/1pY-wC0Bfb3QyDSBzGNbPvrUtHAgox3_zCmtOhXo149Y/edit

1. Open the Sheet as its owner and choose **Extensions → Apps Script**.
2. Copy [Code.gs](../google-apps-script/Code.gs) and [State.gs](../google-apps-script/State.gs) into separate files in the Apps Script project. Remove the default sample function. `State.gs` is generated from the tested `server/sheet-state.mjs`; regenerate it with `npm run sheets:build` whenever that file changes.
3. In **Project Settings → Script Properties**, set `SPREADSHEET_ID` and `SHEETS_STORE_SECRET`. A local, ignored `secrets/sheets-test-properties.json` has been prepared with your Sheet ID and a random secret. Copy its values directly into Script Properties; do not paste secrets into chat or commit them. The matching secret is already in `.env`.
4. Choose **Deploy → New deployment → Web app**, execute as **Me**, and allow access to **Anyone**. Authorize spreadsheet access. The endpoint is reachable publicly but every operation is protected by HMAC authentication; the spreadsheet itself must remain private. If your Workspace administrator prohibits this deployment mode, this approach will not work under that account.
5. Copy the resulting `https://script.google.com/macros/s/.../exec` URL into `SHEETS_STORE_URL` in `.env`. Use `/exec`, not the editor or `/dev` URL.
6. Run `npm.cmd run sheets:check`. This checks the signed connection and initializes the environment's tab; it creates no registration or payment.
7. Restart with `npm.cmd start`, open http://localhost:3001 and run the registration flow with Razorpay test payments.

Updating Apps Script source does not update an existing deployment automatically. After changes, use **Deploy → Manage deployments → Edit → New version → Deploy**.

## Ledger layout and privacy

The script creates `RegistrationsTest` or `RegistrationsLive` with columns for clinic, customer contact details, amount, payment status, provider references, email status and agreement version. Column A is hidden and contains the authoritative record, session hashes and immutable billing details. Hidden columns are not access controls: all spreadsheet editors can read the records. Restrict access accordingly.

Do not edit, delete, sort, insert or move rows in these tabs; they are application storage. Use filter views or a separate reporting tab for analysis. All application writes must go through the same Apps Script project for a given environment so its ScriptLock coordinates them. Make regular restricted backups. The ledger intentionally stops accepting new registrations at 2,000 rows per environment; this lightweight setup is for low volume, and requires review before growing beyond that.

Customer-entered values are stored as text to prevent spreadsheet formula injection. No API keys, payment signatures or raw session tokens are written to the Sheet. Existing SQLite files under `data/` were preserved for historical reference; they are not opened by the new application, and their records have not been migrated. Check any real historical/unsettled invoices before enabling the replacement in production. Old CLI invoice links are no longer supported; use the normal registration page.

## Deploy to Netlify

1. Connect the repository in Netlify. If the repository contains the outer folder, set **Base directory** to `tootica-website`; `netlify.toml` then supplies `dist` as the publish directory and `netlify/functions` as the functions directory. A static drag-and-drop of `dist` alone does not deploy the payment backend.
2. Set server environment variables in Netlify: `NODE_ENV=production`, `PUBLIC_ORIGIN=https://reg.tootica.com` (or your actual Netlify HTTPS domain), `PAYMENT_ENVIRONMENT=test` for the first hosted test, `PAYMENTS_ENABLED=true`, `ESSENTIAL_PRICE_INR=11870`, the matching test Razorpay pair, the webhook secret, `SHEETS_STORE_URL`, and `SHEETS_STORE_SECRET`. Set `AWS_LAMBDA_JS_RUNTIME=nodejs24.x` if the site already has an older function runtime pinned. These variables must be available to functions; do not put secrets in `netlify.toml`, `dist`, or public frontend variables.
3. Add the custom domain, configure the DNS records Netlify provides, and wait for HTTPS. Keep `PUBLIC_ORIGIN` identical to the actual site origin. Preview deployments need their own explicit test configuration; do not enable live keys on previews.
4. In Razorpay, configure `https://YOUR-DOMAIN/api/payments/webhook` for `payment.captured`, `order.paid` and `payment.failed`. Use the matching server webhook secret and enable automatic capture.
5. Configure Brevo/SMTP and the approved invoice company address using [EMAIL-AND-SHEETS.md](../EMAIL-AND-SHEETS.md). Until configured, invoices remain downloadable and the confirmation screen does not claim that an email was sent.
6. Test order creation, cancellation, failed-payment retry, a successful test payment, refresh, invoice download and mail delivery before switching to live mode.

For live mode, use the live Razorpay pair and `PAYMENT_ENVIRONMENT=live`. The ignored `.env.production` retains the approved price and live keys; payments remain disabled there until activation. The current configuration shares the test SMTP settings, Apps Script URL and storage secret with production. The script separates test and live records into `RegistrationsTest` and `RegistrationsLive`. Keep the matching secret in that script's properties; do not overwrite it with the older separate `secrets/sheets-live-properties.json` value. Do not configure two different script projects to write the same environment tab.

For invitation-only registration, deploy both updated `Code.gs` and `State.gs` before enabling `INVITATIONS_REQUIRED=true` in Netlify. The admin page uses the same ledger and requires the separate secret `INVITATION_ADMIN_KEY`. Follow [INVITATIONS.md](INVITATIONS.md).

## Emails and scheduled retries

Verified captured payments queue an email in the Sheet. The verification/status request attempts delivery, and Netlify's scheduled function checks one queued email every 15 minutes. These are request-bound/scheduled jobs, not a permanent background server. Local development also checks once per minute. SMTP acceptance is recorded before the success screen says email was sent.

An interrupted or ambiguous SMTP send is marked `review` after two minutes to avoid automatic duplicate emails. Check the mail provider first. Only if it confirms non-delivery, run `npm.cmd run deliveries -- --retry INVOICE_UUID --confirm-not-delivered`, then `npm.cmd run deliveries`. Routine manual delivery: `npm.cmd run deliveries`.

## Cost and limits

Netlify permits commercial projects on its Free plan, subject to its usage/credit limits. Google Apps Script has execution, concurrency and daily quotas. This setup can avoid a hosting/database subscription at low volume, but does not promise unlimited capacity, uptime or permanently free service. Razorpay transaction charges, domain renewal and any paid SMTP plan still apply. If quotas are reached, payments fail closed or delivery may be delayed; inspect Netlify and Apps Script dashboards.

Sources: [Netlify Free plan](https://www.netlify.com/blog/introducing-netlify-free-plan/), [function limits](https://docs.netlify.com/build/functions/configuration/), [scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/), [Google Apps Script web apps](https://developers.google.com/apps-script/guides/web), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [ScriptLock](https://developers.google.com/apps-script/reference/lock/lock-service).
