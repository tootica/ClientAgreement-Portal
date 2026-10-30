# Confirmation emails and Google Sheets

Google Sheets is now the authoritative registration ledger, not an optional reporting export. [Set up the private Sheet and Apps Script endpoint](deploy/GOOGLE-SHEETS-SETUP.md). No service account or database is required.

## SMTP setup

Configure these server-only environment variables:

```dotenv
EMAIL_ENABLED=true
EMAIL_ALLOW_TEST=false
EMAIL_FROM=noreply@tootica.com
EMAIL_REPLY_TO=
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-brevo-smtp-login
SMTP_PASSWORD=your-brevo-smtp-key
INVOICE_COMPANY_ADDRESS=your-approved-billing-address
INVOICE_TAX_ID=
```

Use the actual Brevo SMTP login and SMTP key, and verify the sending address/domain. STARTTLS is required on port 587. For port 465, use SMTP_SECURE=true. Complete the approved billing address before enabling mail. No tax registration number or tax split is invented. The optional `INVOICE_FONT_PATH` must point to a private font available to the deployment; leave it empty to use the bundled PDF font. Leave email disabled until SMTP and billing details are ready. To send test-payment mail, explicitly set EMAIL_ALLOW_TEST=true in the test environment.

## Delivery flow

The admin invitation form also uses these SMTP settings. **Create and email invitation** sends the private link to the entered client email and records a separate invitation-mail status. `EMAIL_ENABLED` and test-mode `EMAIL_ALLOW_TEST` apply to invitations too. See [invitation email delivery](deploy/INVITATIONS.md#invitation-email-delivery) for setup and handling uncertain sends. Payment receipts and invitation emails have separate statuses; invitation emails are not automatically retried.

If only a link is created, check the email-status banner at the top of the unlocked admin page. When `EMAIL_ENABLED=false`, the button reads **Create invitation link**, and no SMTP request is made. In Netlify, set `EMAIL_ENABLED=true`, complete `INVOICE_COMPANY_ADDRESS` and the existing SMTP/sender settings, then redeploy. Live mode does not require `EMAIL_ALLOW_TEST=true`. Updating a local env file alone does not change Netlify. Older Apps Script deployments also need the latest generated `State.gs` deployed as a new version for invitation-email status tracking. Previously created link-only invitations are not emailed automatically after enabling delivery.

Captured payments store the invoice and a pending mail status in the Sheet. The verification or status request attempts delivery, attaching an in-memory paid invoice PDF. The confirmation screen claims email was sent only after SMTP accepts the intended recipient and that status is recorded. Unconfigured email shows an invoice-download fallback. Sending a message does not guarantee inbox delivery; check provider bounces if the customer reports a missing message.

Netlify retries one pending email every 15 minutes using its scheduled function; local development checks once per minute. Definite SMTP rejection uses delayed retries. An ambiguous disconnect or interrupted send becomes review after two minutes, preventing automatic duplicate sends. Inspect SMTP logs before manually retrying:

```powershell
npm.cmd run deliveries -- --retry INVOICE_UUID --confirm-not-delivered
npm.cmd run deliveries
```

Find the invoice UUID in hidden column A of the appropriate Sheet tab. Do not edit that record manually. Disabled test mail is never sent, and unpaid invoices cannot produce paid PDFs. Refreshing the paid page restores the receipt from the stored session without another charge.

## Sheet access

`RegistrationsTest` and `RegistrationsLive` show clinic/contact information, payment references, amounts, status, agreement version and email status. A hidden authoritative record column stores sessions and frozen snapshots. All editors can access it; hiding a column is not security. Keep access restricted, maintain backups and use a separate reporting tab or filter view rather than sorting or editing the application-managed data. API secrets and raw session tokens are never stored in the Sheet.
