import QRCode from "qrcode";
import { stateName } from "@zentro/commerce";
import type { StoreSettings } from "@zentro/commerce/settings";

export interface LabelOrder {
  id: string; orderNumber: string; createdAt: Date; phone: string;
  address: { fullName: string; phone: string; line1: string; line2?: string; landmark?: string; city: string; stateCode: string; pincode: string };
  items: { name: string; sku: string; quantity: number }[]; weightGrams: number | null;
  shipment: { carrier: string; trackingNumber: string | null } | null;
}

/** One A6-ish page: shipping label on top, packing slip below (no prices, gift-safe). */
export async function ShippingLabel({ o, from }: { o: LabelOrder; from: StoreSettings }) {
  const qr = await QRCode.toDataURL(o.shipment?.trackingNumber ?? o.orderNumber, { margin: 0, width: 160 });
  const a = o.address;
  return (
    <section className="label-page mx-auto mb-8 max-w-[148mm] break-after-page rounded-lg bg-white p-5 text-[13px] text-black ring-1 ring-black print:mb-0 print:rounded-none print:ring-0" aria-label={`Label for ${o.orderNumber}`}>
      <div className="flex justify-between gap-4 border-b-2 border-black pb-3">
        <div>
          <p className="text-[11px] font-bold uppercase">Deliver to</p>
          <p className="text-lg font-bold leading-tight">{a.fullName}</p>
          <p className="leading-snug">{a.line1}{a.line2 && `, ${a.line2}`}{a.landmark && <><br />{a.landmark}</>}<br />{a.city}, {stateName(a.stateCode)}</p>
          <p className="mt-1 text-2xl font-bold tracking-widest">{a.pincode}</p>
          <p>Phone: {a.phone || o.phone}</p>
        </div>
        <img src={qr} alt={`QR code ${o.shipment?.trackingNumber ?? o.orderNumber}`} className="size-28 shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-b border-black py-3 text-[12px]">
        <div><p className="font-bold uppercase">From</p><p>{from.legalName ?? from.businessName}</p>{from.address && <p className="whitespace-pre-line">{from.address}</p>}{from.supportPhone && <p>{from.supportPhone}</p>}{from.gstin && <p>GSTIN {from.gstin}</p>}</div>
        <div className="text-right"><p className="font-bold uppercase">Order</p><p className="font-mono text-base font-bold">{o.orderNumber}</p><p>{o.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
          {o.shipment?.trackingNumber && <p className="mt-1">{o.shipment.carrier}<br /><span className="font-mono font-bold">AWB {o.shipment.trackingNumber}</span></p>}
          <p className="mt-1">Prepaid · {o.weightGrams ? `${(o.weightGrams / 1000).toFixed(2)} kg` : "weight —"}</p></div>
      </div>
      <div className="pt-3">
        <p className="font-bold uppercase">Packing slip</p>
        <table className="mt-1 w-full text-[12px]"><thead><tr className="border-b border-black text-left"><th className="py-1">Item</th><th>SKU</th><th className="text-right">Qty</th></tr></thead>
          <tbody>{o.items.map((i) => <tr key={i.sku} className="border-b border-dotted border-black/40"><td className="py-1 pr-2">{i.name}</td><td className="font-mono">{i.sku}</td><td className="text-right font-bold">{i.quantity}</td></tr>)}</tbody></table>
        <p className="mt-2 text-[11px]">{o.items.reduce((n, i) => n + i.quantity, 0)} item(s). Questions? {from.supportEmail ?? from.supportPhone ?? "Contact us via the website."}</p>
      </div>
    </section>
  );
}

export const LABEL_SQL = `
  select o.id, o.order_number as "orderNumber", o.created_at as "createdAt", o.phone, o.shipping_address as address,
         coalesce((select json_agg(json_build_object('name', i.product_name || coalesce(' (' || i.variant_label || ')', ''), 'sku', i.sku, 'quantity', i.quantity) order by i.product_name)
                   from shop.order_items i where i.order_id = o.id), '[]') as items,
         coalesce((select s.weight_grams from shop.shipments s where s.order_id = o.id order by s.created_at desc limit 1),
                  (select sum(coalesce(v.weight_grams, 0) * i.quantity)::int from shop.order_items i left join shop.product_variants v on v.id = i.variant_id where i.order_id = o.id)) as "weightGrams",
         (select json_build_object('carrier', s.carrier, 'trackingNumber', s.tracking_number) from shop.shipments s where s.order_id = o.id order by s.created_at desc limit 1) as shipment
  from shop.orders o`;
