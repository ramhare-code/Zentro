-- =====================================================================
-- Courier integration (Shiprocket) and tracking timeline.
-- =====================================================================

alter table shop.shipments
    add column provider              text check (provider in ('manual', 'shiprocket')) default 'manual',
    add column provider_order_id     text,
    add column provider_shipment_id  text,
    add column courier_name          text,
    add column label_url             text check (label_url is null or label_url ~ '^https://'),
    add column weight_grams          integer check (weight_grams > 0),
    add column last_synced_at        timestamptz,
    add column last_status_raw       text;
create unique index shipments_provider_shipment_uq on shop.shipments (provider, provider_shipment_id) where provider_shipment_id is not null;
create index shipments_tracking_idx on shop.shipments (provider, status) where delivered_at is null;

alter table shop.shipment_events add column raw_status text;
create unique index shipment_events_dedupe_uq on shop.shipment_events (shipment_id, occurred_at, status);
