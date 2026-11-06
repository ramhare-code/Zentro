import { NextResponse } from "next/server";
import { IMPORT_COLUMNS } from "@/lib/catalog-admin";
import { getSession } from "@/lib/session";

/** Example CSV with every supported column. */
export async function GET() {
  const s = await getSession();
  if (!s?.permissions.has("products.write")) return new NextResponse(null, { status: 403 });
  const rows = [
    IMPORT_COLUMNS.join(","),
    'steel-water-bottle,Steel Water Bottle,kitchen-dining,lumen-home,"Keeps drinks cold for 24 hours","Double-wall vacuum insulated bottle.","Leak-proof lid|BPA free",9617,18,SWB-500-BLK,"Color=Black; Capacity=500 ml",699,999,40,350,https://images.unsplash.com/photo-1602143407151-7111542de6e8,draft,no',
    'steel-water-bottle,Steel Water Bottle,kitchen-dining,lumen-home,,,,,,SWB-750-BLK,"Color=Black; Capacity=750 ml",799,1099,25,420,,draft,no',
  ];
  return new NextResponse(rows.join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="zentro-products-template.csv"' } });
}
