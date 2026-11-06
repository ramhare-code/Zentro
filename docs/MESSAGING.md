# Customer messaging — setup guide

Zentro sends three kinds of messages from one outbox:

| Kind | Examples | Who gets it | Consent |
|---|---|---|---|
| **Transactional** | order confirmed, shipped (with carrier + tracking), out for delivery, delivered, cancelled, refund processed | the order's customer, automatically | Email + SMS always (service messages); WhatsApp only if they ticked "order updates on WhatsApp" at checkout |
| **Service** | a one-to-one message about an order, sent by staff from *Messaging → Compose* | that order's customer | same as transactional |
| **Promotional** | sales, new arrivals, coupons — *Messaging → Campaigns* | only customers who opted in to **that channel** | explicit, unchecked opt-in at checkout; stored in an append-only ledger |

Nothing is shown as "sent" unless the provider accepted it, and nothing as "delivered"
unless the provider reported it. When a provider or template isn't ready, the message is
recorded as **skipped** with the reason.

## What you need to set up

### 1. Email — Resend
1. Create an account at resend.com, add and verify your sending domain (DNS records).
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (e.g. `Zentro <orders@yourstore.in>`) in **both** apps.
3. Webhook → `https://<shop-domain>/api/webhooks/resend`, events: sent, delivered, bounced, complained.
   Put its signing secret in `RESEND_WEBHOOK_SECRET` (storefront). Bounces/complaints automatically
   withdraw email marketing consent.

### 2. SMS — DLT + MSG91 (India)
TRAI rules require every commercial SMS to be registered on a DLT platform.
1. Register your business as a **Principal Entity** on a DLT portal (Jio, Airtel, Vi, BSNL…). You get an **Entity ID**.
2. Register a **sender header** (6 letters, e.g. `ZENTRO`) — *transactional/service* and *promotional* headers are separate.
3. Register **each template** exactly as written in Zentro, with variables marked `{#var#}`. You get a **DLT template ID** per template.
   Promotional templates must include an opt-out (Zentro adds `{{unsubscribe_link}}`).
4. In MSG91, add your Entity ID and header, create a template for each DLT template, and note the **MSG91 template ID**.
5. In Zentro admin → *Messaging → Templates*, open each SMS template, enter the DLT template ID and MSG91 template ID, and set *Provider approval = Approved*.
6. Set `MSG91_AUTH_KEY` (both apps). Delivery reports → `https://<shop-domain>/api/webhooks/msg91?token=<MSG91_WEBHOOK_TOKEN>`.

### 3. WhatsApp — Meta Cloud API
1. Create a WhatsApp Business Account in Meta Business Manager, add and verify a phone number.
2. Create message templates in WhatsApp Manager (utility templates for order updates, marketing templates for promotions) and wait for approval.
3. In Zentro, enter each template's exact name and language and mark it *Approved*. Body variables are sent in the order they appear.
4. Set `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN` (a permanent system-user token) in both apps.
5. Webhook → `https://<shop-domain>/api/webhooks/whatsapp`, verify token `WHATSAPP_VERIFY_TOKEN`, app secret `WHATSAPP_APP_SECRET`.
   Subscribe to `messages`. Delivery/read receipts update the history; replies of **STOP** unsubscribe immediately.

### 4. Unsubscribe links
Set the same random `UNSUBSCRIBE_SECRET` in both apps. Promotions are not sent without it.

## Safeguards built in
* Consent is re-checked at the moment each promotional message is sent.
* Promotions only go out in the permitted window (default 10:00–21:00 IST; the admin cannot set it outside 09:00–21:00).
* Frequency caps (default 1 per channel per day, 3 per week).
* Campaigns above the approval threshold (default 200 recipients) need approval by someone other than the creator (or the Owner), with a fresh 2-step code.
* Eligible recipient count and estimated cost are shown before submission; test sends go to your own number/email.
* Staff can record an unsubscribe on a customer's request, but can never opt a customer in.
* Every send, campaign change and consent change is in the audit log / consent ledger.
* Delivery runs from the storefront's cron (`/api/cron/maintenance`, every 5 minutes) with retries and back-off.
