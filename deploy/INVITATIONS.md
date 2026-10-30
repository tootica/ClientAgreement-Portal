# Client invitation links

The public agreement can be read without an invitation. When `INVITATIONS_REQUIRED=true`, starting a registration and creating a new checkout require a valid invitation. Existing orders can still be reconciled and paid invoices remain available to their original sessions.

## Enable the feature

1. Run `npm.cmd run sheets:build` after source changes. Copy both `google-apps-script/Code.gs` and `google-apps-script/State.gs` into your existing Apps Script project, then deploy a new version. Keep its existing spreadsheet ID, shared secret and `/exec` URL. The same script can serve test and live; it separates their rows into `RegistrationsTest` and `RegistrationsLive`.
2. Set `INVITATION_ADMIN_KEY` in Netlify to the private random value prepared in `.env.production`. Mark it as secret and make it available to Functions in the Production context. The key must have at least 32 characters. Do not use a Razorpay, Sheets or SMTP secret as this key.
3. Set `INVITATIONS_REQUIRED=true` in Netlify. Redeploy the application. Keep payment activation and the first hosted test process described in [PRODUCTION-SETUP.md](PRODUCTION-SETUP.md).
4. Open `https://reg.tootica.com/admin.html`. Enter the admin key to unlock invitation management. The admin page stores the key only in memory; refresh or **Lock admin** clears it. Anyone holding this key can create invitations and view invitation names/emails, so share it only with trusted staff.

For local use, enter a separate admin key in `.env` and set `INVITATIONS_REQUIRED=true` only after updating the connected Apps Script deployment. Restart the local server. Use `/admin.html` on the local origin. New env entries are initially disabled to preserve the existing setup until the script is updated.

## Invite a client

1. Enter the client's name, email address and expiry (1, 3 or 7 days).
2. Select **Create and email invitation**. The server uses the same SMTP credentials and verified sender as payment-confirmation emails to send the private link to the entered address.
3. Check the delivery message. You can also copy the same generated link and share it directly if needed.
4. Ask the client to use the same browser throughout registration. Their email address is prefilled and checkout must use that email address.

The full invitation link is shown only once. The Sheet stores its hash, not the usable link. If the link is lost before checkout starts, revoke the invitation and create another. Do not issue another invitation for a registration whose checkout has already started without checking payment status first.

The admin list shows pending, opened, expired, revoked, checkout started, or completed. Each invitation reserves one registration row and the price at creation. Test and live invitations are separate. Invitations share the existing limit of 2,000 records per environment.

## Invitation email delivery

Deploy the latest generated `State.gs` as a new Apps Script version and redeploy Netlify before using automatic invitation mail. Keep the existing SMTP host, port, login and key. Set `EMAIL_ENABLED=true` with the verified `EMAIL_FROM` and approved billing address required by the application configuration. Test-mode mail additionally requires `EMAIL_ALLOW_TEST=true`; live-mode mail does not. No new SMTP account is needed. Invitation replies use `EMAIL_REPLY_TO` when configured, otherwise `support@tootica.com`.

The email contains the client's private registration link, expiry in India Standard Time and same-browser instructions. It is not a payment receipt and has no invoice attachment. Emailing the link does not verify ownership of the address.

The admin list has a separate email-delivery column. **Accepted for delivery** means SMTP accepted the intended recipient; check Brevo for bounces or inbox-delivery issues. Definite SMTP rejection shows **Not sent** and keeps the created link available to copy. A disconnect or failure to record acceptance shows **Check Brevo logs**; check the provider before sending the link again. Requests interrupted during sending become review-required after two minutes.

Invitation emails are attempted once during creation and are not retried by the payment-email scheduler. The usable link remains only in the create response and email; the ledger stores its hash and delivery status. If a request times out, refresh the invitation list and check Brevo before creating another invitation. If you need a replacement and checkout has not started, revoke the old invitation first.

## Expiry, revocation and privacy

- A link may be redeemed in one browser. Once opened, another browser cannot redeem it. The original browser session lasts up to 12 hours and cannot outlive the invitation. Reopening the invitation in the original active browser reuses the same registration.
- Pending and opened invitations can be revoked before checkout starts. Revocation blocks both the link and its existing registration session. The next request detects the change; it cannot erase information already shown to that browser.
- Starting checkout freezes the invitation for payment reconciliation; it cannot then be revoked. Expiry never cancels an existing Razorpay order or refunds a payment. Provider webhooks still reconcile captured payments after browser-session expiry.
- The link does not verify the recipient's identity or ownership of their email. It can be forwarded before redemption. Email OTP verification and cross-device recovery are not implemented in this version.
- Names and emails are not included in the link. The random token is in the URL fragment and is removed from the address bar immediately. Admin list responses omit link/session hashes and raw tokens. Treat the invitation link as private while it remains unused.
- Do not manually edit invitation rows in Google Sheets. Rotate the admin key in Netlify and redeploy if staff access needs to be removed; old keys then stop working on subsequent API requests.

Automated tests simulate providers and Sheets. Before live use, verify a hosted invitation, missing/expired/revoked link, successful test payment, retry, invoice download and email delivery.

## Netlify site access and admin errors

If the admin page reports that hosting access was blocked, check Netlify's **Project configuration > General > Visitor access**. Team-login or private-project protection applies before this application's admin authentication. Sign in to that Netlify access screen when testing a protected deployment. The admin API includes same-origin cookies so the existing hosting-access session can be sent.

When launching for clients, production must be reachable without requiring clients to join your Netlify team. Adjust production project visibility/protection accordingly; previews can remain private. Keep `INVITATIONS_REQUIRED=true` and `INVITATION_ADMIN_KEY` configured to protect registration and admin actions inside the app. See [Netlify visitor access documentation](https://docs.netlify.com/manage/security/secure-access-to-sites/project-visibility/).

If a non-JSON HTTP 500/502 error remains after hosting access is resolved, inspect the `payments` function logs for that request. A hosting/runtime failure is different from an invalid admin key, which this application returns as a JSON error.
