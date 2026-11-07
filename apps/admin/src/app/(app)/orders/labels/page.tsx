import { loadStoreSettings } from "@zentro/commerce/settings";
import { LABEL_SQL, ShippingLabel, type LabelOrder } from "@/components/orders/ShippingLabel";
import { PrintBar } from "@/components/orders/PrintBar";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Labels to print" };

/** All paid orders that are packed (or processing) and not yet shipped — one label per page. */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requirePermission("orders.update");
  await requirePermission("customers.pii");
  const status = (await searchParams).status === "processing" ? "processing" : "packed";
  const sql = db();
  const orders = await sql<LabelOrder[]>`${sql.unsafe(LABEL_SQL)} where o.status = ${status} and o.payment_status = 'paid' order by o.placed_at limit 50`;
  const from = await loadStoreSettings(sql);
  return (
    <div>
      <PrintBar back="/orders" count={orders.length} note={`${status === "packed" ? "Packed" : "Processing"} orders, oldest first (up to 50).`} />
      {orders.length === 0 ? <p className="card p-8 text-center text-sm text-ink-muted">No {status} orders waiting.</p> : orders.map((o) => <ShippingLabel key={o.id} o={o} from={from} />)}
    </div>
  );
}
