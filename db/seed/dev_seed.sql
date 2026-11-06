-- =====================================================================
-- DEVELOPMENT / STAGING SEED DATA — NOT FOR PRODUCTION
-- Sample catalogue so the storefront can be built and tested. Brands,
-- stock levels, GST rates and FAQ answers here are illustrative only.
-- Replace with your real catalogue and policies before launch.
-- Contains NO reviews or ratings: those come only from verified buyers.
-- =====================================================================

insert into shop.categories (id, slug, name, description, image_url, sort_order) values
 (md5('cat:electronics')::uuid, 'electronics','Electronics','Audio, wearables and everyday tech.','https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',1),
 (md5('cat:fashion')::uuid, 'fashion','Fashion','Footwear and everyday style.','https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',2),
 (md5('cat:home')::uuid, 'home','Home','Lighting, kitchen and living essentials.','https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80',3),
 (md5('cat:accessories')::uuid, 'accessories','Accessories','Bags, travel and carry essentials.','https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',4)
on conflict (slug) do nothing;

insert into shop.categories (id, slug, name, parent_id, image_url, sort_order)
select md5('cat:' || v.slug)::uuid, v.slug, v.name, c.id, v.img, v.ord from (values
 ('audio','Audio','electronics','https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',1),
 ('wearables','Wearables','electronics','https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',2),
 ('footwear','Footwear','fashion','https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',1),
 ('lighting','Lighting','home','https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80',1),
 ('kitchen-dining','Kitchen & Dining','home','https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80',2),
 ('bags','Bags & Backpacks','accessories','https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80',1),
 ('travel','Travel Accessories','accessories','https://images.unsplash.com/photo-1553531889-56d7f53f3955?auto=format&fit=crop&w=800&q=80',2)
) v(slug,name,parent,img,ord) join shop.categories c on c.slug = v.parent
on conflict (slug) do nothing;

insert into shop.brands (id, slug, name) select md5('brand:' || b.slug)::uuid, b.slug, b.name from (values
 ('aurora-audio','Aurora Audio'),
 ('pulse-labs','Pulse Labs'),
 ('stride-co','Stride Co'),
 ('lumen-home','Lumen Home'),
 ('northtrail','Northtrail')) b(slug, name)
on conflict (slug) do nothing;

-- Wireless Noise-Cancelling Headphones
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'wireless-noise-cancelling-headphones')::uuid, 'wireless-noise-cancelling-headphones', 'Wireless Noise-Cancelling Headphones', b.id, c.id, 'Comfortable wireless headphones with immersive sound, soft ear cushions and long listening support.', 'Designed for comfortable everyday listening with a clean wireless experience, immersive audio and a lightweight over-ear design.',
         '{"Wireless listening","Comfort-focused ear cushions","Noise-reduction design","Portable everyday build"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Over-ear"},{"label":"Connectivity","value":"Wireless"},{"label":"Use","value":"Music & calls"},{"label":"Warranty","value":"See seller details"}]}]'::jsonb, '8518', 18, true, now() - interval '24 days'
  from shop.brands b, shop.categories c where b.slug = 'aurora-audio' and c.slug = 'audio'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80', 'Wireless Noise-Cancelling Headphones', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-001-1', '{"Color":"Midnight Black"}', 499900, 799900, 25, 0),
  ('ZN-001-2', '{"Color":"Pearl White"}', 499900, 799900, 8, 1)
) v(sku, options, price, mrp, stock, pos);

-- Smart Fitness Watch
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'smart-fitness-watch')::uuid, 'smart-fitness-watch', 'Smart Fitness Watch', b.id, c.id, 'A modern smart watch for everyday activity tracking, notifications and quick fitness information.', 'A lightweight smart wearable designed for everyday activity tracking and convenient access to useful information from your wrist.',
         '{"Activity tracking","Notification support","Lightweight design","Everyday fitness features"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Smart watch"},{"label":"Display","value":"Digital"},{"label":"Use","value":"Fitness"},{"label":"Connectivity","value":"Wireless"}]}]'::jsonb, '8517', 18, true, now() - interval '21 days'
  from shop.brands b, shop.categories c where b.slug = 'pulse-labs' and c.slug = 'wearables'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80', 'Smart Fitness Watch', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-002-1', '{"Color":"Graphite"}', 249900, 399900, 30, 0),
  ('ZN-002-2', '{"Color":"Rose Gold"}', 269900, 399900, 0, 1)
) v(sku, options, price, mrp, stock, pos);

-- Everyday Classic Sneakers
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'everyday-classic-sneakers')::uuid, 'everyday-classic-sneakers', 'Everyday Classic Sneakers', b.id, c.id, 'Versatile everyday sneakers with a clean shape, comfortable fit and casual styling for regular use.', 'A clean casual sneaker concept designed for everyday outfits, comfortable movement and versatile styling.',
         '{"Casual everyday design","Comfort-focused fit","Lightweight construction","Versatile styling"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Sneakers"},{"label":"Style","value":"Casual"},{"label":"Use","value":"Everyday"},{"label":"Fit","value":"Standard"}]}]'::jsonb, '6404', 18, false, now() - interval '18 days'
  from shop.brands b, shop.categories c where b.slug = 'stride-co' and c.slug = 'footwear'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80', 'Everyday Classic Sneakers', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-003-1', '{"Size":"UK 7"}', 179900, 299900, 5, 0),
  ('ZN-003-2', '{"Size":"UK 8"}', 179900, 299900, 12, 1),
  ('ZN-003-3', '{"Size":"UK 9"}', 179900, 299900, 9, 2),
  ('ZN-003-4', '{"Size":"UK 10"}', 179900, 299900, 0, 3)
) v(sku, options, price, mrp, stock, pos);

-- Minimal Desk Lamp
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'minimal-desk-lamp')::uuid, 'minimal-desk-lamp', 'Minimal Desk Lamp', b.id, c.id, 'A clean desk lamp designed for study spaces, bedside tables and modern home-office setups.', 'A simple modern lighting concept suited to desks, study spaces and bedside use with a clean minimal appearance.',
         '{"Minimal design","Desk-friendly size","Modern appearance","Useful study lighting"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Desk lamp"},{"label":"Style","value":"Minimal"},{"label":"Room","value":"Study / bedroom"},{"label":"Power","value":"See product details"}]}]'::jsonb, '9405', 18, true, now() - interval '15 days'
  from shop.brands b, shop.categories c where b.slug = 'lumen-home' and c.slug = 'lighting'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80', 'Minimal Desk Lamp', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-004-1', '{}', 129900, 199900, 40, 0)
) v(sku, options, price, mrp, stock, pos);

-- Premium Everyday Backpack
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'premium-everyday-backpack')::uuid, 'premium-everyday-backpack', 'Premium Everyday Backpack', b.id, c.id, 'Spacious everyday backpack with a clean design for school, travel and carrying daily essentials.', 'A versatile backpack concept with practical storage space and a clean appearance for everyday carrying.',
         '{"Multiple storage areas","Everyday carrying design","Comfort-focused straps","Travel-friendly layout"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Backpack"},{"label":"Use","value":"Daily / travel"},{"label":"Style","value":"Modern"},{"label":"Storage","value":"Multi-compartment"}]}]'::jsonb, '4202', 18, true, now() - interval '12 days'
  from shop.brands b, shop.categories c where b.slug = 'northtrail' and c.slug = 'bags'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80', 'Premium Everyday Backpack', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-005-1', '{"Color":"Navy"}', 219900, 349900, 18, 0),
  ('ZN-005-2', '{"Color":"Stone Grey"}', 219900, 349900, 6, 1)
) v(sku, options, price, mrp, stock, pos);

-- Portable Bluetooth Speaker
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'portable-bluetooth-speaker')::uuid, 'portable-bluetooth-speaker', 'Portable Bluetooth Speaker', b.id, c.id, 'Compact wireless speaker built for easy music listening at home, outdoors or while travelling.', 'A portable wireless speaker concept designed for convenient everyday listening and easy carrying.',
         '{"Portable design","Wireless playback","Compact body","Everyday audio use"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Portable speaker"},{"label":"Connectivity","value":"Bluetooth"},{"label":"Use","value":"Music"},{"label":"Form","value":"Compact"}]}]'::jsonb, '8518', 18, false, now() - interval '9 days'
  from shop.brands b, shop.categories c where b.slug = 'aurora-audio' and c.slug = 'audio'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=800&q=80', 'Portable Bluetooth Speaker', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-006-1', '{}', 159900, 259900, 3, 0)
) v(sku, options, price, mrp, stock, pos);

-- Modern Insulated Bottle
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'modern-insulated-bottle')::uuid, 'modern-insulated-bottle', 'Modern Insulated Bottle', b.id, c.id, 'Reusable everyday bottle with a simple modern appearance for school, travel and daily hydration.', 'A reusable bottle concept created for convenient everyday hydration with a clean, portable design.',
         '{"Reusable construction","Portable size","Everyday design","Travel friendly"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Bottle"},{"label":"Use","value":"Hydration"},{"label":"Style","value":"Modern"},{"label":"Portable","value":"Yes"}]}]'::jsonb, '9617', 18, false, now() - interval '6 days'
  from shop.brands b, shop.categories c where b.slug = 'lumen-home' and c.slug = 'kitchen-dining'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=800&q=80', 'Modern Insulated Bottle', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-007-1', '{"Capacity":"500 ml"}', 79900, 129900, 50, 0),
  ('ZN-007-2', '{"Capacity":"1 litre"}', 99900, 149900, 22, 1)
) v(sku, options, price, mrp, stock, pos);

-- Compact Travel Organizer
with prod as (
  insert into shop.products (id, slug, name, brand_id, category_id, short_description, description, highlights, specifications, hsn_code, gst_rate, is_featured, created_at)
  select md5('product:' || 'compact-travel-organizer')::uuid, 'compact-travel-organizer', 'Compact Travel Organizer', b.id, c.id, 'A compact organizer for keeping cables, accessories and small travel essentials neatly together.', 'A practical organizer concept intended to keep small accessories and everyday travel items easy to find.',
         '{"Compact storage","Travel-friendly format","Accessory organization","Lightweight design"}'::text[], '[{"group":"General","items":[{"label":"Type","value":"Organizer"},{"label":"Use","value":"Travel"},{"label":"Storage","value":"Compact"},{"label":"Portable","value":"Yes"}]}]'::jsonb, '4202', 18, false, now() - interval '3 days'
  from shop.brands b, shop.categories c where b.slug = 'northtrail' and c.slug = 'travel'
  on conflict (slug) do nothing
  returning id
), media as (
  insert into shop.product_media (id, product_id, kind, url, alt, width, height, sort_order)
  select md5('media:' || id::text)::uuid, id, 'image', 'https://images.unsplash.com/photo-1553531889-56d7f53f3955?auto=format&fit=crop&w=800&q=80', 'Compact Travel Organizer', 800, 800, 0 from prod
  returning product_id
)
insert into shop.product_variants (id, product_id, sku, options, price_paise, mrp_paise, stock, position)
select md5('variant:' || v.sku)::uuid, prod.id, v.sku, v.options::jsonb, v.price, v.mrp, v.stock, v.pos from prod, (values
  ('ZN-008-1', '{}', 69900, 99900, 0, 0)
) v(sku, options, price, mrp, stock, pos);

-- reset the small singleton lists so the seed can be re-run
delete from shop.banners;
delete from shop.shipping_rates;
delete from shop.faqs;

insert into shop.banners (title, subtitle, cta_label, cta_href, image_url, theme, sort_order) values
 ('Sound that moves with you', 'Wireless audio picks for work, travel and everything between.', 'Shop audio', '/c/audio', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80', 'dark', 1),
 ('Carry everything, beautifully', 'Backpacks and travel organisers built for daily use.', 'Shop accessories', '/c/accessories', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80', 'dark', 2),
 ('Light up your workspace', 'Minimal lighting and home essentials.', 'Shop home', '/c/home', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80', 'dark', 3);

insert into shop.shipping_rates (name, min_subtotal_paise, max_subtotal_paise, fee_paise, est_days_min, est_days_max, cod_available, priority) values
 ('Free standard delivery', 49900, null, 0, 3, 7, false, 10),
 ('Standard delivery', 0, 49899, 4900, 3, 7, false, 20);

insert into shop.coupons (code, description, discount_type, discount_value, max_discount_paise, min_order_paise, per_user_limit) values
 ('WELCOME10', '10% off your order (up to ₹300) — development sample coupon', 'percent', 10, 30000, 99900, 1)
on conflict (code) do nothing;

insert into shop.faqs (topic, question, answer, sort_order) values
 ('Orders', 'How do I track my order?', 'Open My Orders from your account, or use the order number and the secure link in your confirmation email.', 1),
 ('Orders', 'Can I cancel my order?', 'Orders can be cancelled from the order page until they are packed. Once shipped, you can request a return after delivery instead.', 2),
 ('Payments', 'Which payment methods are accepted?', 'UPI, debit and credit cards, net banking and wallets, processed securely by our payment partner.', 1),
 ('Payments', 'My payment failed but money was debited. What now?', 'Failed payments are reversed automatically by your bank, usually within 5–7 working days. Contact support with your order number if it takes longer.', 2),
 ('Delivery', 'How long does delivery take?', 'The estimated delivery window is shown at checkout for your pincode.', 1),
 ('Returns & refunds', 'How do I return a product?', 'Open the delivered order and choose Request return within the return window shown on the product page.', 1),
 ('Returns & refunds', 'When will I get my refund?', 'Refunds are issued to the original payment method once the return is received and checked. Your bank may take 5–7 working days to show it.', 2);
