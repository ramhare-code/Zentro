import { notFound } from "next/navigation";
import { z } from "zod";
import { loadStoreSettings } from "@zentro/commerce/settings";
import { LABEL_SQL, ShippingLabel, type LabelOrder } from "@/components/orders/ShippingLabel";
import { PrintBar } from "@/components/orders/PrintBar";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Shipping label" };

export default async function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("orders.update");
  await requirePermission("customers.pii"); // labels carry the full address
  const id = z.guid().safeParse((await params).id).data;
  if (!id) notFound();
  const sql = db();
  const [o] = await sql<LabelOrder[]>`${sql.unsafe(LABEL_SQL)} where o.id = ${id} and o.payment_status = 'paid'`;
  if (!o) notFound();
  return <div><PrintBar back={`/orders/${id}`} count={1} /><ShippingLabel o={o} from={await loadStoreSettings(sql)} /></div>;
}
