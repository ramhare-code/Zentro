# Operating the store (no admin panel)

By design there is no admin website or public management endpoint. Catalogue and order
operations are done by authorised people through **Supabase's authenticated dashboard**
(Table editor / SQL editor, protected by your Supabase account login + 2FA) or through
reviewed SQL scripts. Grant dashboard access only to the people who need it.

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

## Before launch — business checklist

* Real catalogue, prices, HSN codes and GST rates confirmed with your accountant.
* Business details in environment variables (legal name, address, GSTIN, support contacts,
  grievance officer) — required by Indian e-commerce rules and by Razorpay.
* Policies in `src/content/policies.ts` reviewed by a legal adviser.
* Razorpay account activated (KYC) and live keys set only in the Production environment.
* Do **not** load `db/seed/dev_seed.sql` into production.
