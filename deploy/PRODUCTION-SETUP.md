# Netlify deployment

## Build settings

Connect the repository in Netlify. Set the base directory to `tootica-website` if the repository contains that outer folder; leave it empty if `package.json` is at the repository root.

`netlify.toml` sets the build command to `npm run build`, publish directory to `dist`, functions directory to `netlify/functions`, and Node.js to 24. The build runs syntax checks and the automated test suite. PDFKit is externalized and its built-in font data is included for paid invoice generation. The `payments` function serves `/payment-config.json` and `/api/payments/*`; `deliveries` retries one queued email every 15 minutes on the published site.

Deploy through Git or run `netlify deploy --build --prod` from the project directory with an installed, authenticated Netlify CLI after completing the settings below. Uploading only `dist` does not deploy the payment backend. Do not use `npm start` as a Netlify build command.

## Environment settings

Enter values in Netlify's environment settings, available to Functions in the production deploy context. Local `.env` and `.env.production` are private references and are not automatically deployed. Never copy credentials into `dist` or `netlify.toml`.

| Variable | First hosted test | Live launch |
| --- | --- | --- |
| `NODE_ENV` | `production` | `production` |
| `PUBLIC_ORIGIN` | Exact deployed HTTPS origin | `https://www.reg.tootica.com` if using that domain |
| `PAYMENT_ENVIRONMENT` | `test` | `live` |
| `PAYMENTS_ENABLED` | `true` once test storage is connected | `true` after launch checks |
| `ESSENTIAL_PRICE_INR` | `11870` | `11870` or your approved price |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Matching test pair | Matching live pair |
| `RAZORPAY_WEBHOOK_SECRET` | Test dashboard webhook secret | Live dashboard webhook secret |
| `SHEETS_STORE_URL`, `SHEETS_STORE_SECRET` | Test deployment URL and matching secret | Live deployment URL and matching secret |
| `EMAIL_ENABLED` | `true` after sender and billing setup | `true` after sender and billing setup |
| `EMAIL_ALLOW_TEST` | `true` to test confirmation email | `false` |
| `EMAIL_FROM` | Brevo-verified sender address | Brevo-verified sender address |
| `SMTP_HOST` | `smtp-relay.brevo.com` | Same |
| `SMTP_PORT`, `SMTP_SECURE` | `587`, `false` (STARTTLS) | Same |
| `SMTP_USER`, `SMTP_PASSWORD` | Brevo SMTP login and SMTP key | Brevo SMTP login and SMTP key |
| `INVOICE_COMPANY_ADDRESS` | Approved company billing address | Approved company billing address |

Keep `MERCHANT_NAME`, `PAYMENT_DESCRIPTION` and `AGREEMENT_VERSION` consistent with `.env.example`. `EMAIL_REPLY_TO` and `INVOICE_TAX_ID` are optional. Leave `INVOICE_FONT_PATH` empty to use built-in PDF fonts; a local Windows path is unavailable in Netlify Functions. If an older function runtime is pinned, set `AWS_LAMBDA_JS_RUNTIME=nodejs24.x` in Netlify's UI. Redeploy after changing runtime variables.

Use separate test credentials for deploy previews. Follow [GOOGLE-SHEETS-SETUP.md](GOOGLE-SHEETS-SETUP.md) to deploy the latest `Code.gs` and `State.gs` and configure the live ledger. Do not have multiple Apps Script projects writing the same environment tab.

## Before enabling live payments

1. Configure the domain and HTTPS; match `PUBLIC_ORIGIN` exactly, without a trailing slash or path.
2. Configure the Razorpay webhook at `https://YOUR-DOMAIN/api/payments/webhook` for `payment.captured`, `order.paid` and `payment.failed`, with the matching secret and automatic capture enabled.
3. Complete a hosted test checkout. Verify failure, closed checkout, Review agreement, retry, success, refresh, PDF download and actual email delivery. Ensure retry and refresh keep the same invoice.
4. Confirm registrations and payment/email statuses appear in the test Sheet. Check Netlify function logs and run the scheduled deliveries function from the dashboard if needed.
5. Configure the live ledger and matching live provider credentials, reconcile historical unsettled orders, then enable live payments and redeploy. Test credentials authenticating does not verify live credentials.

## Local files

Keep `.env`, `.env.production`, `secrets/` and historical `data/` private; `.gitignore` excludes them. Historical SQLite files are backups and are not used or migrated by the application. `artifacts/`, `node_modules/` and `.netlify/` are local output/dependencies and are also ignored. Retain tests, the lockfile, Apps Script source and active asset attribution in the repository.

References: [Netlify function configuration](https://docs.netlify.com/build/functions/configuration/), [runtime environment variables](https://docs.netlify.com/build/functions/environment-variables/), [scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/).
