"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const BRAND = "#6d35d4";
const GRID = "#e6e5ee";
const MUTED = "#5b5a66";
const tip = { borderRadius: 12, border: `1px solid ${GRID}`, boxShadow: "0 8px 24px rgb(22 21 28 / .08)" };

const fmt = (b: string, monthly: boolean) => {
  const d = new Date(b + "T00:00:00");
  return monthly ? d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }) : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** One measure per chart (no dual axes): rendered twice as small multiples. */
export function TrendChart({ data, dataKey, label, monthly }: { data: object[]; dataKey: string; label: string; monthly: boolean }) {
  const rows: Record<string, string | number>[] = (data as Record<string, string | number>[]).map((d) => ({ ...d, label: fmt(String(d.bucket), monthly) }));
  const empty = rows.every((r) => !Number(r[dataKey]));
  if (empty) return <div className="grid h-48 place-items-center rounded-xl bg-canvas text-sm text-ink-muted">No data in this period yet.</div>;
  return (
    <div className="h-48" role="img" aria-label={`${label} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} width={40} allowDecimals={false} />
          <Tooltip cursor={{ stroke: MUTED, strokeDasharray: "3 3" }} formatter={(v) => [Number(v).toLocaleString("en-IN"), label]} contentStyle={tip} />
          <Line type="monotone" dataKey={dataKey} stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} animationDuration={600} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FunnelChart({ data }: { data: { step: string; sessions: number }[] }) {
  const top = data[0]?.sessions ?? 0;
  if (!top) return <div className="grid h-48 place-items-center rounded-xl bg-canvas text-sm text-ink-muted">Funnel needs visitors who accepted analytics.</div>;
  const rows = data.map((d) => ({ ...d, pct: `${d.sessions} · ${Math.round((d.sessions / top) * 100)}%` }));
  return (
    <div className="h-60" role="img" aria-label="Shopping funnel">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 90, left: 0, bottom: 0 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="step" width={130} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
          <Tooltip cursor={{ fill: "rgb(109 53 212 / .06)" }} formatter={(v) => [v, "Sessions"]} contentStyle={tip} />
          <Bar dataKey="sessions" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={24} animationDuration={600}>
            <LabelList dataKey="pct" position="right" style={{ fill: "#16151c", fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
