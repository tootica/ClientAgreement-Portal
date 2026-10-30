# Payments

The payment backend uses Razorpay Standard Checkout and a private Google Sheets ledger. No SQLite database or local disk is used. [Connect Google Sheets and deploy on Netlify](deploy/GOOGLE-SHEETS-SETUP.md) before enabling checkout.

## Server environment

Copy `.env.example` to `.env` for local development. `npm start` loads `.env`; `.env.production` is a private template and is not loaded automatically. On Netlify, enter values in the site's server environment settings.

- `PUBLIC_ORIGIN`: exact site origin, without a path; HTTPS is required in production.
- `PAYMENTS_ENABLED`: true only after provider and storage setup.
- `PAYMENT_ENVIRONMENT`: test or live. Keys must match this mode. Live requires `NODE_ENV=production`.
- `ESSENTIAL_PRICE_INR`: annual Essential price in rupees, currently 11870. Converted exactly to paise on the server. Changing the price refreshes untouched drafts; started orders retain their original price.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`: matching dashboard pair, server only. Only the public key ID is sent with checkout orders.
- `RAZORPAY_WEBHOOK_SECRET`: the separate secret configured in the dashboard webhook.
- `SHEETS_STORE_URL`: deployed Apps Script HTTPS /exec URL.
- `SHEETS_STORE_SECRET`: random server-to-script secret, at least 32 characters, matching Script Properties.
- `AGREEMENT_VERSION`, `MERCHANT_NAME`, `PAYMENT_DESCRIPTION`: server-owned invoice/acceptance settings.

Secrets belong in ignored env files or the hosting dashboard, never in `dist` or public frontend variables. Restart the local server after changes. Use `npm run payments:check` to verify provider authentication without creating an order, and `npm run sheets:check` to verify storage.

## API and payment guarantees

The frontend uses `POST /api/payments/session`, `GET /api/payments/summary`, `POST /api/payments/orders`, `POST /api/payments/verify`, `GET /api/payments/orders/:id` and `GET /api/payments/invoice`. Provider events arrive at `POST /api/payments/webhook`. Public non-secret settings are served dynamically at `/payment-config.json`.

Session cookies are HttpOnly and SameSite=Strict; production uses Secure cookies. Client details, email, agreement version and signature name are validated and frozen at order preparation. Prices and currency come from the stored invoice, with a minimum of 100 paise. Only Essential is available. The backend verifies HMAC-SHA256 of the stored order ID plus payment ID, then confirms provider ownership, capture, amount and currency. A signature mismatch returns 400 and never marks the invoice paid.

Order claims are written before calling Razorpay. A definite provider rejection allows retry; an uncertain timeout preserves the claim and subsequent requests search by receipt rather than creating another order. Capture and email claims are idempotent. Sessions and claims survive function restarts because they live in the Sheet, not server memory. Raw webhook HMACs are verified before provider reconciliation. Customer-entered cells cannot execute formulas.

Dashboard webhook events: payment.captured, order.paid, payment.failed. Enable automatic capture. A valid signature alone does not mean payment has been captured; authorised payments remain pending. Modal dismissal or a failed attempt may reopen the same unpaid order after reconciliation.

## Validation

Run `npm test`, `npm run check` and `npm run test:browser`. Automated checks simulate external systems; a successful test-mode checkout and deployed Apps Script connection still need manual verification before live launch. Test refresh, multiple tabs, tampered amounts/signatures, cancellation, failed payment retry, PDF download and email status.

Old manual invoice CLI links and the SQLite backend have been retired. Historical `data/` files remain untouched and are not imported automatically. Do not start collecting live payments until any old real orders have been reconciled.

See [EMAIL-AND-SHEETS.md](EMAIL-AND-SHEETS.md) for confirmation emails and [deploy/GOOGLE-SHEETS-SETUP.md](deploy/GOOGLE-SHEETS-SETUP.md) for quotas, access controls and setup steps.
