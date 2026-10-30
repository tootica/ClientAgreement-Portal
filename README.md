# Tootica registration and client agreement

A buildless HTML/CSS/JavaScript registration site with Razorpay Standard Checkout, a private Google Sheets ledger, PDF invoices and optional SMTP confirmation emails. The flow is Details ? Package ? Agreement ? Payment ? Done.

## Run locally

Use Node.js 24+. Run `npm.cmd ci`, configure `.env`, then `npm.cmd start` and open http://localhost:3001. On non-Windows systems use `npm` instead of `npm.cmd`. Static files are already in `dist`; `npm run build` runs syntax and automated checks before deployment.

## Google Sheets and free hosting

Follow [deploy/GOOGLE-SHEETS-SETUP.md](deploy/GOOGLE-SHEETS-SETUP.md) to connect your Sheet through the included Apps Script and deploy the Node API as Netlify Functions. No database, service-account JSON or persistent disk is required. Until the signed Sheets endpoint is configured, checkout stays unavailable. Free hosting has usage limits; Razorpay, domain and email charges are separate.

Use [deploy/PRODUCTION-SETUP.md](deploy/PRODUCTION-SETUP.md) for the Netlify deployment checklist, environment settings and launch verification. Deploy the project through Git or the Netlify CLI; uploading only `dist` will omit the payment API.

Sheets stores registration sessions, accepted details, order state, payment references and email delivery status. Apps Script serializes writes with a lock, preserves order claims across timeouts and prevents automatic duplicate email sends. The browser never receives storage, SMTP or Razorpay secrets. Keep the Sheet private and its application-managed tabs unedited; use a separate reporting tab for analysis. Existing `data/` files are preserved as historical backups and are no longer used. Historical records have not been migrated.

## Configuration and testing

- [PAYMENTS.md](PAYMENTS.md): prices, payment settings, verification and webhooks.
- [EMAIL-AND-SHEETS.md](EMAIL-AND-SHEETS.md): SMTP and delivery status.
- [docs/CLIENT-AGREEMENT.md](docs/CLIENT-AGREEMENT.md): readable snapshot of the website agreement.
- `npm.cmd run sheets:check`: signed storage connection check.
- `npm.cmd run payments:check`: read-only Razorpay authentication check.
- `npm.cmd test`: validation, Sheets state transitions, verification, email and PDF checks with simulated providers.
- `npm.cmd run test:browser`: full registration flow using an installed Edge browser and a simulated Sheet/provider; no real payments or emails.
- `npm.cmd run check`: JavaScript syntax checks.
- `npm.cmd run sheets:build`: regenerate the Apps Script state engine after changing `server/sheet-state.mjs`.

## Files

- `dist/`: static interface, agreement content, contact validation and handwriting animation.
- `server/sheets-app.mjs`: session-scoped payment API, provider verification and delivery handling.
- `server/sheets-store.mjs`: HMAC-authenticated Google Apps Script client.
- `server/sheet-state.mjs`: ledger state transitions, deployed to Apps Script as generated `State.gs`.
- `google-apps-script/`: source to deploy from the Google account that owns the Sheet.
- `netlify/functions/`: payment API and a scheduled email retry function.
- `netlify.toml`: static publish and function settings.

The Essential annual price is configured in rupees using `ESSENTIAL_PRICE_INR=11870`. Practice Plus remains disabled. No automatic recurring charge is created. Razorpay order amounts come from the server; only verified, captured payments are marked paid. Confirmation distinguishes queued, sent and unavailable mail, and provides an authenticated invoice download.

The signature uses public-domain Hershey single-stroke lettering with an accessible reduced-motion fallback. Client names, consent and billing details are recorded with the order. Refer to the source comments and browser checks when changing that flow.
