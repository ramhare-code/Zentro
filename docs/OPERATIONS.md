# Operating the store

Day-to-day operations move into the **Zentro Admin** website (`apps/admin`, see
`docs/ADMIN.md`) as each admin phase ships. Until a section is available there, use
**Supabase's authenticated dashboard** (Table editor / SQL editor, protected by your
Supabase login + 2FA) or reviewed SQL scripts, as below.

## Adding a product

```sql
with p as (
  insert into shop.products (slug, name, brand_id, category_id, short_description, description,
                             highlights, specifications, hsn_code, gst_rate)
  values ('my-product', 'My Product',
          (select id from shop.brands where slug = 'my-brand'),
          (select id from shop.categories where slug = 'audio'),
          'One-line summary', 'Full description',
          array['Highlight one', 'Highlight two'],
          '[{"group":"General","items":[{"label":"Material","value":"Aluminium"}]}]',
          '8518', 18)
  returning id
)
insert into shop.product_variants (product_id, sku, options, price_paise, mrp_paise, stock)
select id, 'SKU-001-BLK', '{"Color":"Black"}', 249900, 299900, 50 from p;
```

Upload images to the `product-media` Storage bucket and insert rows into `shop.product_media`
(`kind = 'image'` or `'video'`, `sort_order` 0 = primary).

## Stock

`update shop.product_variants set stock = 120 where sku = 'SKU-001-BLK';`

Never lower stock below what open orders have reserved; Phase 4 adds a helper that checks this.

## Hiding a product

`update shop.products set is_active = false where slug = 'my-product';`

Pages refresh within 5 minutes (ISR).

## Orders, shipments, refunds

Phase 4–5 add audited SQL functions (e.g. `shop.mark_shipped(order_number, carrier, awb)`) so
fulfilment updates always write an `order_events` row and queue the customer notification.
Use those functions rather than editing order rows directly.

## Payments and settlements

- **Webhook:** in the Razorpay dashboard → Webhooks, add `https://<storefront>/api/webhooks/razorpay` with the secret in `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`. Every event appears in Admin → Payments → Gateway events; failed ones can be retried there.
- **Missed confirmations:** the 5-minute cron asks Razorpay about any attempt that is 10 minutes – 7 days old and still unconfirmed, before releasing reserved stock. Staff can run the same check from a payment or the Reconciliation page. The admin site needs `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for this.
- **Duplicate charges:** if a customer pays twice for one order, the second payment is refunded automatically and noted on the order.
- **Settlements:** weekly, download the Settlement recon report (CSV) from Razorpay → Reports and upload it on Reconciliation. Choose whether amounts are in rupees or paise. *Check* compares only; *Record* stores fees and settlement ids for lines that match amount and status exactly. Mismatches and unknown ids are listed for you to investigate in Razorpay — nothing is changed for them. Column names in Razorpay reports can change; the importer accepts the common ones (`entity_id`/`payment_id`/`id`, `amount`/`credit`/`debit`, `fee`, `tax`, `settlement_id`, `settled_at`). Check the first import's totals against the report.

## Finance and GST

- **What profit includes:** net sales (ex-GST, on invoice date) minus returns/cancellations (credit notes), cost of goods (unit cost captured at the time of sale from your latest purchase-order cost) and Razorpay fees (ex-GST). It does **not** include courier bills, packaging, ads, salaries or rent.
- **Costs:** sales of items with no cost price are flagged on the Finance page. Receive stock through purchase orders so each SKU has a cost.
- **GST filing:** Finance → GST gives B2C figures by rate, by place of supply (GSTR-1 B2CS) and by HSN (Table 12), net of credit notes. Export them and review with your accountant; Zentro does not file returns.
- **Shipping:** shipping is currently charged without GST. If your accountant confirms it should be taxed as part of a composite supply, the pricing rules need changing before launch.
- **Set on the admin site:** `BUSINESS_LEGAL_NAME`, `BUSINESS_GSTIN`, `SELLER_STATE_CODE` (same as the storefront).

## Coupons, promotions and banners

- **Promotions** change the price customers pay, everywhere, for the time window you set — no code needed. If two promotions cover an item, the lower price wins. Saving one that would sell anything below its recorded cost is refused unless you tick the confirmation.
- **Coupons** are typed in at checkout (or tapped, if “show as an offer” is on). Untick “also applies to items already on sale” to stop a coupon stacking with a promotion.
- **Banners**: upload wide images (about 1600 × 600) and write alt text. Links must point to pages on your store.
- Cached storefront pages refresh when you save, and the 5-minute job refreshes them when a scheduled promotion or banner starts or ends. Checkout always uses the live price.

## Pages, policies and FAQs

- Edit in Admin → Pages & FAQs. Saving keeps a draft; customers see a change only after **Publish**. Every save is kept — use “Restore as draft” to bring back an older version.
- Formatting: `## Heading`, `- bullet`, `1. step`, `**bold**`, `[text](/help)`. Placeholders such as `{email}` and `{returnDays}` are filled from configuration; unset ones show as typed and are flagged in the editor.
- The four policies start as **draft legal text**. Have an adviser check them against how you actually work, then publish with “A legal adviser has reviewed this text” ticked.

## Courier (Shiprocket) and labels

- **Labels without a courier account:** Orders → *Print labels for packed orders* prints a shipping label and packing slip (no prices) per order, with a QR code. Single orders: *Print label & packing slip* on the order.
- **Shiprocket:** set `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD` (an API user from Shiprocket → Settings → API) and `SHIPROCKET_PICKUP_LOCATION` (the exact pickup location name) on **both** apps. Packed orders then show **Book courier**: it creates the shipment, assigns an AWB, requests pickup, stores the courier label and marks the order shipped (the customer is notified).
- **Tracking:** set `SHIPROCKET_WEBHOOK_TOKEN` on the storefront and add the webhook `https://<storefront>/api/webhooks/courier` in Shiprocket with that token (Shiprocket rejects URLs containing “shiprocket” or “sr”, hence the name). The 5-minute job also pulls tracking for undelivered shipments. Orders move to *out for delivery* and *delivered* automatically; failed deliveries and returns-to-origin raise an alert.
- Test the integration against your Shiprocket account before launch — field names were implemented from Shiprocket’s public API docs and verified only against a local stand-in.

## Before launch — business checklist

* Real catalogue, prices, HSN codes and GST rates confirmed with your accountant.
* Business details in environment variables (legal name, address, GSTIN, support contacts,
  grievance officer) — required by Indian e-commerce rules and by Razorpay.
* Policies in `src/content/policies.ts` reviewed by a legal adviser.
* Razorpay account activated (KYC) and live keys set only in the Production environment.
* Do **not** load `db/seed/dev_seed.sql` into production.
