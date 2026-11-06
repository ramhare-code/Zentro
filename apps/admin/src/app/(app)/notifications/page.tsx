import Link from "next/link";
import clsx from "clsx";
import { getAlerts } from "@/lib/alerts";
import { requirePermission } from "@/lib/session";

export const metadata = { title: "Alerts" };
const label = { critical: "Critical", warning: "Warning", info: "Info" } as const;
const tone = { critical: "bg-bad-50 text-bad-700", warning: "bg-warn-50 text-warn-700", info: "bg-info-50 text-info-700" } as const;

export default async function NotificationsPage() {
  const s = await requirePermission("notifications.read");
  const alerts = await getAlerts(s);
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-ink-muted">Computed live from stock, payments, support and integrations. Only alerts for areas you can access are shown.</p>
      </div>
      {alerts.length === 0 ? (
        <div className="card p-8 text-center text-ink-muted">All clear — nothing needs attention right now.</div>
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.key}>
              <Link href={a.href} className="card flex items-center gap-4 p-4 hover:ring-brand-200">
                <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-semibold", tone[a.severity])}>{label[a.severity]}</span>
                <span className="flex-1"><span className="block font-semibold">{a.title}</span><span className="block text-sm text-ink-muted">{a.detail}</span></span>
                <span aria-hidden className="text-ink-subtle">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
