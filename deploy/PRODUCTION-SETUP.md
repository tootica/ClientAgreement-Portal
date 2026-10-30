# Netlify deployment

This guide replaces the old Linux server instructions headed "Application and secrets". For Netlify, you do not create a service user, install `tootica.service`, use `/opt/tootica` or `/etc/tootica/payments.env`, or set up a persistent database. Enter the backend settings directly in Netlify's Environment variables screen as described below. Registration records are stored in Google Sheets.

## Build settings

Connect the repository in Netlify. Set the base directory to `tootica-website` if the repository contains that outer folder; leave it empty if `package.json` is at the repository root.

You do not need to install Node.js on Netlify yourself. Node.js runs the backend that verifies payments, connects to Google Sheets, creates invoices and sends email. This project selects version 24 in `netlify.toml` and `.node-version`; Netlify installs the selected version and the project's npm dependencies automatically. Installing Node.js 24 on your own computer is only needed for local development, testing or deployment through the local CLI. Deploying through Netlify's Git connection does not require a local Node.js installation. See [Netlify's dependency setup](https://docs.netlify.com/build/configure-builds/manage-dependencies/).

`netlify.toml` sets the build command to `npm run build`, publish directory to `dist`, functions directory to `netlify/functions`, and Node.js to 24. The build runs syntax checks and the automated test suite. PDFKit is externalized and its built-in font data is included for paid invoice generation. The `payments` function serves `/payment-config.json` and `/api/payments/*`; `deliveries` retries one queued email every 15 minutes on the published site.

Deploy through Git or run `netlify deploy --build --prod` from the project directory with an installed, authenticated Netlify CLI after completing the settings below. Uploading only `dist` does not deploy the payment backend. Do not use `npm start` as a Netlify build command.

## Environment settings

All the application settings below are environment variables. A "secret" is simply an environment variable whose value is sensitive, such as a password or API secret. Both ordinary settings and secrets are entered in Netlify's environment settings; no separate secrets file is required on Netlify.

### Where to store each setting

| Location | What to put there |
| --- | --- |
| Local `.env` | Values used when you run the application on your computer. |
| Local `.env.production` | A private reference for production values. Netlify does not automatically load this file. |
| Netlify environment variables | Settings used by the deployed payment and email backend. |
| Apps Script Script Properties | `SPREADSHEET_ID` and `SHEETS_STORE_SECRET`, used by the separate Google Apps Script deployment. |

### Add the variables in Netlify

1. Open your project in the Netlify dashboard and go to **Project configuration → Environment variables**.
2. Choose **Add a variable**, then add a single variable.
3. Enter the variable name in **Key** and its value in **Value**, without surrounding quotes. For example, key `PUBLIC_ORIGIN` and value `https://reg.tootica.com`.
4. If a scope selector is available on your plan, include **Functions**. These settings are read by the backend, including the scheduled email function.
5. If deploy-context choices are available, choose **Production** for the values used on your published site. This Netlify context also applies during your first hosted test: use Razorpay test keys and `PAYMENT_ENVIRONMENT=test` until you are ready for live payments. Keep live credentials out of deploy previews.
6. Save and repeat for each variable in the table below. A row listing two names means create two separate variables.
7. Deploy or redeploy after saving the settings.

For passwords and keys, copy the actual value directly from your private local file or provider dashboard into Netlify. Do not paste the entire `KEY=value` line into the Value field. The backend reads these settings through `process.env`; the browser does not receive the secret values. Never copy credentials into `dist` or `netlify.toml`. See [Netlify's function environment-variable documentation](https://docs.netlify.com/build/functions/environment-variables/).

### Values to enter

| Variable | First hosted test | Live launch |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` |
| `PUBLIC_ORIGIN` | Exact deployed HTTPS origin | `https://reg.tootica.com` if using that domain |
| `PAYMENT_ENVIRONMENT` | `test` | `live` |
| `PAYMENTS_ENABLED` | `true` once test storage is connected | `true` after launch checks |
| `ESSENTIAL_PRICE_INR` | `11870` | `11870` or your approved price |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Matching test pair | Matching live pair |
| `RAZORPAY_WEBHOOK_SECRET` | Test dashboard webhook secret | Live dashboard webhook secret |
| `SHEETS_STORE_URL`, `SHEETS_STORE_SECRET` | Test deployment URL and matching secret | Live deployment URL and matching secret |
| `INVITATIONS_REQUIRED` | `true` after updating Apps Script | `true` for invitation-only registration |
| `INVITATION_ADMIN_KEY` | Separate private test admin key, at least 32 characters | Private production admin key from `.env.production`; mark secret |
| `EMAIL_ENABLED` | `true` after sender and billing setup | `true` after sender and billing setup |
| `EMAIL_ALLOW_TEST` | `true` to test confirmation email | `false` |
| `EMAIL_FROM` | Brevo-verified sender address | Brevo-verified sender address |
| `SMTP_HOST` | `smtp-relay.brevo.com` | Same |
| `SMTP_PORT`, `SMTP_SECURE` | `587`, `false` (STARTTLS) | Same |
| `SMTP_USER`, `SMTP_PASSWORD` | Brevo SMTP login and SMTP key | Brevo SMTP login and SMTP key |
| `INVOICE_COMPANY_ADDRESS` | Approved company billing address | Approved company billing address |

Keep `MERCHANT_NAME`, `PAYMENT_DESCRIPTION` and `AGREEMENT_VERSION` consistent with `.env.example`. `EMAIL_REPLY_TO` and `INVOICE_TAX_ID` are optional. Leave `INVOICE_FONT_PATH` empty to use built-in PDF fonts; a local Windows path is unavailable in Netlify Functions. If an older function runtime is pinned, set `AWS_LAMBDA_JS_RUNTIME=nodejs24.x` in Netlify's UI. Redeploy after changing runtime variables.

### Secrets scanning

Netlify scans repository files and build output for values matching environment variables marked as secrets. Public settings such as the merchant name, agreement version, sender address, SMTP hostname, prices and feature flags also appear intentionally in source, examples or browser assets. `netlify.toml` excludes only these non-sensitive environment variable names with `SECRETS_SCAN_OMIT_KEYS` under `[build.environment]`. Keep their values non-sensitive.

Credential scanning remains enabled across all paths, including tests and documentation. Do not exclude payment secrets, SMTP credentials, the Sheets store secret or the invitation admin key. If a deploy still fails, inspect the detection entries above the final error in the deploy log for the exact variable name and file location. Remove any exposed credential and rotate it with its provider before redeploying; do not disable scanning to bypass the failure.

Use separate test credentials for deploy previews. Follow [GOOGLE-SHEETS-SETUP.md](GOOGLE-SHEETS-SETUP.md) to deploy the latest `Code.gs` and `State.gs` and configure the live ledger. Do not have multiple Apps Script projects writing the same environment tab. The same Apps Script endpoint and secret can serve test and live in separate tabs, matching the current shared configuration.

### Client invitations

After updating Apps Script, set `INVITATIONS_REQUIRED=true`, import the private `INVITATION_ADMIN_KEY` into Netlify and redeploy. Open `https://reg.tootica.com/admin.html` to create expiring client links and revoke unused invitations. Without a link, visitors can read the agreement but cannot start registration. See [INVITATIONS.md](INVITATIONS.md) for setup, sharing and limitations. The new private env entries start with invitations disabled until the Apps Script update is deployed.

### Add the Google Apps Script properties

In your Apps Script project, open **Project Settings → Script Properties** and add `SPREADSHEET_ID` and `SHEETS_STORE_SECRET`. The `SHEETS_STORE_SECRET` value must exactly match the value entered in Netlify for the corresponding test or live deployment. `SPREADSHEET_ID` is used only by Apps Script; it does not need to be added to Netlify. Put the deployed Apps Script `/exec` URL in Netlify as `SHEETS_STORE_URL`.

## Before enabling live payments

1. Configure the domain and HTTPS; match `PUBLIC_ORIGIN` exactly, without a trailing slash or path.
2. Configure the Razorpay webhook at `https://YOUR-DOMAIN/api/payments/webhook` for `payment.captured`, `order.paid` and `payment.failed`, with the matching secret and automatic capture enabled.
3. Complete a hosted test checkout. Verify failure, closed checkout, Review agreement, retry, success, refresh, PDF download and actual email delivery. Ensure retry and refresh keep the same invoice.
4. Confirm registrations and payment/email statuses appear in the test Sheet. Check Netlify function logs and run the scheduled deliveries function from the dashboard if needed.
5. Configure the live ledger and matching live provider credentials, reconcile historical unsettled orders, then enable live payments and redeploy. Test credentials authenticating does not verify live credentials.

## Local files

Keep `.env`, `.env.production`, `secrets/` and historical `data/` private; `.gitignore` excludes them. Historical SQLite files are backups and are not used or migrated by the application. `artifacts/`, `node_modules/` and `.netlify/` are local output/dependencies and are also ignored. Retain tests, the lockfile, Apps Script source and active asset attribution in the repository.

References: [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/), [runtime environment variables](https://docs.netlify.com/build/functions/environment-variables/), [scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/).
