"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BRAND = "#6d35d4";
const GRID = "#e6e5ee";
const MUTED = "#5b5a66";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });

function labelFor(bucket: string, monthly: boolean) {
  const d = new Date(bucket + "T00:00:00");
  return monthly ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function RevenueChart({ data, monthly }: { data: { bucket: string; revenue: number; orders: number }[]; monthly: boolean }) {
  const rows = data.map((d) => ({ ...d, rupees: d.revenue / 100, label: labelFor(d.bucket, monthly) }));
  const empty = rows.every((r) => r.rupees === 0);
  return (
    <div>
      <div className="h-72" role="img" aria-label={`Revenue by ${monthly ? "month" : "day"}`}>
        {empty ? (
          <div className="grid h-full place-items-center rounded-xl bg-canvas text-sm text-ink-muted">No paid orders in this period yet.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={BRAND} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} width={64} tickFormatter={(v: number) => inrCompact.format(v)} />
              <Tooltip
                cursor={{ stroke: MUTED, strokeDasharray: "3 3" }}
                formatter={(v) => [inr.format(Number(v)), "Revenue"]}
                labelStyle={{ color: "#16151c", fontWeight: 600 }}
                contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, boxShadow: "0 8px 24px rgb(22 21 28 / .08)" }}
              />
              <Area type="monotone" dataKey="rupees" stroke={BRAND} strokeWidth={2} fill="url(#rev)" animationDuration={600} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-700">View as table</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-muted"><tr><th className="py-1">{monthly ? "Month" : "Date"}</th><th className="py-1 text-right">Paid orders</th><th className="py-1 text-right">Revenue</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((r) => <tr key={r.bucket}><td className="py-1">{r.label}</td><td className="py-1 text-right">{r.orders}</td><td className="py-1 text-right">{inr.format(r.rupees)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function OrderStatusChart({ data }: { data: { label: string; n: number }[] }) {
  if (!data.length) return <div className="grid h-56 place-items-center rounded-xl bg-canvas text-sm text-ink-muted">No orders in this period yet.</div>;
  return (
    <div style={{ height: Math.max(160, data.length * 40) }} role="img" aria-label="Orders by status">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={120} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
          <Tooltip cursor={{ fill: "rgb(109 53 212 / .06)" }} formatter={(v) => [v, "Orders"]} contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}` }} />
          <Bar dataKey="n" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={22} animationDuration={600}>
            <LabelList dataKey="n" position="right" style={{ fill: "#16151c", fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
