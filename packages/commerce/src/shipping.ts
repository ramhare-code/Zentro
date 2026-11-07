// Courier booking and tracking through Shiprocket. Server-side only.
// API: https://apidocs.shiprocket.in — verify field names against your
// account's sandbox before going live; responses are parsed defensively.
import type { Sql } from "./db";
import { advanceOrder, CheckoutError } from "./orders";
import { loadStoreSettings } from "./settings";

export interface ShiprocketConfig { email: string; password: string; pickupLocation: string; apiBase: string; webhookToken?: string }

export function shiprocketConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ShiprocketConfig | null {
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD || !env.SHIPROCKET_PICKUP_LOCATION) return null;
  return {
    email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD, pickupLocation: env.SHIPROCKET_PICKUP_LOCATION,
    apiBase: (env.SHIPROCKET_API_BASE || "https://apiv2.shiprocket.in/v1/external").replace(/\/$/, ""),
    webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN || undefined,
  };
}

// tokens last 10 days; refresh well before
let token: { value: string; key: string; expires: number } | null = null;
async function auth(cfg: ShiprocketConfig): Promise<string> {
  const key = `${cfg.apiBase}|${cfg.email}`;
  if (token && token.key === key && token.expires > Date.now()) return token.value;
  const res = await fetch(`${cfg.apiBase}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: cfg.email, password: cfg.password }), signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as { token?: string; message?: string };
  if (!res.ok || !json.token) throw new Error(`Shiprocket login failed (${res.status}): ${json.message ?? "check SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD"}`);
  token = { value: json.token, key, expires: Date.now() + 8 * 86_400_000 };
  return json.token;
}

async function call<T>(cfg: ShiprocketConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method, headers: { "content-type": "application/json", authorization: `Bearer ${await auth(cfg)}` },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(`Shiprocket ${path} failed (${res.status}): ${json.message ?? "unknown error"}`);
  return json;
}

export class CourierError extends Error {}

/**
 * Creates the shipment with Shiprocket, assigns an AWB (tracking number),
 * requests pickup, fetches the label, and marks the order shipped.
 */
export async function bookShipment(sql: Sql, cfg: ShiprocketConfig, orderId: string, pkg: { weightGrams: number; lengthCm: number; breadthCm: number; heightCm: number }) {
  if (pkg.weightGrams < 10 || pkg.weightGrams > 50_000) throw new CourierError("Weight must be between 10 g and 50 kg.");
  for (const d of [pkg.lengthCm, pkg.breadthCm, pkg.heightCm]) if (!(d >= 0.5 && d <= 200)) throw new CourierError("Box dimensions must be 0.5–200 cm.");
  const [o] = await sql<{ number: string; status: string; payment: string; email: string; phone: string; address: { fullName: string; line1: string; line2?: string; landmark?: string; city: string; stateCode: string; pincode: string }; subtotal: number; discount: number; shipping: number; total: number; createdAt: Date }[]>`
    select order_number as number, status, payment_status as payment, email, phone, shipping_address as address, subtotal_paise as subtotal,
           discount_paise as discount, shipping_paise as shipping, total_paise as total, created_at as "createdAt"
    from shop.orders where id = ${orderId}`;
  if (!o) throw new CourierError("Order not found.");
  if (o.status !== "packed") throw new CourierError("Pack the order before booking a courier.");
  if (o.payment !== "paid") throw new CourierError("Only paid orders can be shipped.");
  const [existing] = await sql`select 1 from shop.shipments where order_id = ${orderId} and provider = 'shiprocket' and status <> 'returned_to_origin'`;
  if (existing) throw new CourierError("This order already has a Shiprocket shipment.");
  const items = await sql<{ name: string; sku: string; qty: number; price: number; hsn: string | null; rate: string }[]>`
    select product_name || coalesce(' (' || variant_label || ')', '') as name, sku, quantity as qty, unit_price_paise as price, hsn_code as hsn, gst_rate::text as rate
    from shop.order_items where order_id = ${orderId} order by id`;
  const settings = await loadStoreSettings(sql);
  const { stateName } = await import("./states");
  const name = o.address.fullName.trim();
  const sp = name.indexOf(" ");

  const created = await call<{ order_id?: number; shipment_id?: number; status?: string }>(cfg, "POST", "/orders/create/adhoc", {
    order_id: o.number, order_date: o.createdAt.toISOString().slice(0, 16).replace("T", " "), pickup_location: cfg.pickupLocation,
    billing_customer_name: sp > 0 ? name.slice(0, sp) : name, billing_last_name: sp > 0 ? name.slice(sp + 1) : "",
    billing_address: o.address.line1, billing_address_2: [o.address.line2, o.address.landmark].filter(Boolean).join(", "),
    billing_city: o.address.city, billing_pincode: o.address.pincode, billing_state: stateName(o.address.stateCode), billing_country: "India",
    billing_email: o.email, billing_phone: o.phone, shipping_is_billing: true,
    order_items: items.map((i) => ({ name: i.name.slice(0, 100), sku: i.sku, units: i.qty, selling_price: i.price / 100, hsn: i.hsn ?? "", tax: Number(i.rate) })),
    payment_method: "Prepaid", shipping_charges: o.shipping / 100, total_discount: o.discount / 100, sub_total: (o.subtotal - o.discount) / 100,
    length: pkg.lengthCm, breadth: pkg.breadthCm, height: pkg.heightCm, weight: pkg.weightGrams / 1000,
    comment: settings.businessName,
  });
  if (!created.shipment_id) throw new CourierError(`Shiprocket didn’t create a shipment${created.status ? ` (${created.status})` : ""}.`);
  const [ship] = await sql<{ id: string }[]>`
    insert into shop.shipments (order_id, carrier, status, provider, provider_order_id, provider_shipment_id, weight_grams)
    values (${orderId}, 'Shiprocket', 'label_created', 'shiprocket', ${String(created.order_id ?? "")}, ${String(created.shipment_id)}, ${pkg.weightGrams}) returning id`;

  const awb = await call<{ awb_assign_status?: number; response?: { data?: { awb_code?: string; courier_name?: string } }; message?: string }>(cfg, "POST", "/courier/assign/awb", { shipment_id: created.shipment_id });
  const code = awb.response?.data?.awb_code, courier = awb.response?.data?.courier_name;
  if (!code) {
    // shipment exists at Shiprocket but no courier yet: keep it so staff can retry or assign in their dashboard
    throw new CourierError(`Shipment created (Shiprocket #${created.shipment_id}), but no courier was assigned${awb.message ? `: ${awb.message}` : ""}. Assign one in Shiprocket, then sync.`);
  }
  await call(cfg, "POST", "/courier/generate/pickup", { shipment_id: [created.shipment_id] }).catch(() => undefined); // pickup can also be requested in the dashboard
  const label = await call<{ label_url?: string; label_created?: number }>(cfg, "POST", "/courier/generate/label", { shipment_id: [created.shipment_id] }).catch(() => ({ label_url: undefined }));
  const labelUrl = label.label_url && /^https:\/\//.test(label.label_url) ? label.label_url : null;
  await sql`update shop.shipments set tracking_number = ${code}, courier_name = ${courier ?? null}, carrier = ${courier ? `${courier} (via Shiprocket)` : "Shiprocket"},
            tracking_url = ${`https://shiprocket.co/tracking/${encodeURIComponent(code)}`}, label_url = ${labelUrl} where id = ${ship!.id}`;
  await advanceOrder(sql, orderId, "shipped", { actor: "operations", note: `Booked with ${courier ?? "Shiprocket"}, AWB ${code}`, existingShipmentId: ship!.id });
  return { shipmentId: ship!.id, awb: code, courier: courier ?? null, labelUrl };
}

// ---------------------------------------------------------------- tracking

export type TrackingStatus = "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "failed_attempt" | "returned_to_origin";

/** Maps courier status text to ours (null = informational, no status change). */
export function mapCourierStatus(raw: string): TrackingStatus | null {
  const s = raw.toUpperCase().replace(/[_-]+/g, " ").trim();
  if (/^RTO|RETURN(ED)? TO ORIGIN/.test(s)) return "returned_to_origin";
  if (/OUT FOR DELIVERY/.test(s)) return "out_for_delivery";
  if (/^DELIVERED$|^DELIVERED /.test(s)) return "delivered";
  if (/UNDELIVERED|FAILED|NDR|NOT DELIVERED|DELIVERY ATTEMPT/.test(s)) return "failed_attempt";
  if (/PICKED UP|PICKUP COMPLETE|SHIPPED/.test(s)) return "picked_up";
  if (/IN TRANSIT|REACHED|ARRIVED|DISPATCHED|CONNECTED/.test(s)) return "in_transit";
  return null;
}

export interface TrackingEvent { status: string; at: Date; location?: string | null; description?: string | null }

/**
 * Records courier events for a shipment (deduplicated) and moves the order
 * forward: out for delivery → delivered. Never moves an order backwards.
 */
export async function applyTracking(sql: Sql, shipmentId: string, events: TrackingEvent[]) {
  const [s] = await sql<{ orderId: string; status: string; orderStatus: string }[]>`
    select s.order_id as "orderId", s.status, o.status as "orderStatus" from shop.shipments s join shop.orders o on o.id = s.order_id where s.id = ${shipmentId}`;
  if (!s) return { added: 0 };
  let added = 0;
  const sorted = [...events].filter((e) => !Number.isNaN(e.at.getTime())).sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const e of sorted) {
    const mapped = mapCourierStatus(e.status);
    const r = await sql`insert into shop.shipment_events (shipment_id, status, raw_status, location, description, occurred_at)
                        values (${shipmentId}, ${mapped ?? "in_transit"}, ${e.status.slice(0, 80)}, ${e.location?.slice(0, 120) ?? null}, ${e.description?.slice(0, 300) ?? null}, ${e.at})
                        on conflict (shipment_id, occurred_at, status) do nothing`;
    added += r.count;
  }
  const latest = sorted.map((e) => ({ e, m: mapCourierStatus(e.status) })).filter((x) => x.m).at(-1);
  if (latest?.m) {
    await sql`update shop.shipments set status = ${latest.m}, last_status_raw = ${latest.e.status.slice(0, 80)}, last_synced_at = now(),
              delivered_at = case when ${latest.m} = 'delivered' then coalesce(delivered_at, ${latest.e.at}) else delivered_at end where id = ${shipmentId}`;
    // order moves only forward, through the same rules (and customer notifications) as manual updates
    if (latest.m === "out_for_delivery" && s.orderStatus === "shipped") await advanceOrder(sql, s.orderId, "out_for_delivery", { actor: "carrier" });
    if (latest.m === "delivered" && ["shipped", "out_for_delivery"].includes(s.orderStatus)) {
      if (s.orderStatus === "shipped") await advanceOrder(sql, s.orderId, "out_for_delivery", { actor: "carrier", note: "Delivered (courier update)", silent: true });
      await advanceOrder(sql, s.orderId, "delivered", { actor: "carrier" });
    }
  } else {
    await sql`update shop.shipments set last_synced_at = now() where id = ${shipmentId}`;
  }
  return { added, status: latest?.m ?? null };
}

interface SrTrack { tracking_data?: { shipment_track_activities?: { date: string; status?: string; activity?: string; location?: string; "sr-status-label"?: string }[] | null; error?: string } }

/** Cron: pulls tracking for undelivered Shiprocket shipments. */
export async function syncTracking(sql: Sql, cfg: ShiprocketConfig, opts: { limit?: number } = {}) {
  const rows = await sql<{ id: string; awb: string }[]>`
    select id, tracking_number as awb from shop.shipments
    where provider = 'shiprocket' and tracking_number is not null and delivered_at is null and status <> 'returned_to_origin'
      and created_at > now() - interval '45 days' and (last_synced_at is null or last_synced_at < now() - interval '50 minutes')
    order by last_synced_at nulls first limit ${opts.limit ?? 40}`;
  let updated = 0, errors = 0;
  for (const r of rows) {
    try {
      const t = await call<SrTrack>(cfg, "GET", `/courier/track/awb/${encodeURIComponent(r.awb)}`);
      const acts = t.tracking_data?.shipment_track_activities ?? [];
      const res = await applyTracking(sql, r.id, acts.map((a) => ({ status: a["sr-status-label"] || a.activity || a.status || "", at: parseIstDate(a.date), location: a.location, description: a.activity })));
      if (res.added) updated++;
    } catch (e) { errors++; console.error("tracking sync", r.awb, e); }
  }
  return { checked: rows.length, updated, errors };
}

/** Shiprocket sends "YYYY-MM-DD HH:mm:ss" in IST. */
export function parseIstDate(v: string): Date {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v) ? new Date(v.replace(" ", "T") + (v.length === 16 ? ":00" : "") + "+05:30") : new Date(v);
}

/** Finds our shipment for an AWB (used by the tracking webhook). */
export async function shipmentForAwb(sql: Sql, awb: string) {
  const [s] = await sql<{ id: string }[]>`select id from shop.shipments where provider = 'shiprocket' and tracking_number = ${awb}`;
  return s?.id ?? null;
}

export { CheckoutError };
