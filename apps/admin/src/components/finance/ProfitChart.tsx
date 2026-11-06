"use client";

import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });

export function ProfitChart({ data, monthly }: { data: { bucket: string; revenuePaise: number; profitPaise: number }[]; monthly: boolean }) {
  const rows = data.map((d) => ({
    label: new Date(d.bucket + "T00:00:00").toLocaleDateString("en-IN", monthly ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" }),
    revenue: d.revenuePaise / 100, profit: d.profitPaise / 100,
  }));
  if (rows.length === 0) return <div className="grid h-72 place-items-center rounded-xl bg-canvas text-sm text-ink-muted">No invoiced sales in this period yet.</div>;
  return (
    <div className="h-72" role="img" aria-label={`Net revenue and gross profit by ${monthly ? "month" : "day"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e6e5ee" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#5b5a66" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickFormatter={(v: number) => compact.format(v)} tick={{ fontSize: 12, fill: "#5b5a66" }} tickLine={false} axisLine={false} width={64} />
          <Tooltip formatter={(v) => inr.format(Number(v))} cursor={{ fill: "#f4f3f8" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="#5b5a66" />
          <Bar dataKey="revenue" name="Net revenue (ex-GST)" fill="#c9b6f2" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="profit" name="Gross profit" fill="#6d35d4" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
