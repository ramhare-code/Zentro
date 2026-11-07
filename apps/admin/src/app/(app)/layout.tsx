import { Topbar } from "@/components/shell/Topbar";
import { getAlerts } from "@/lib/alerts";
import { NAV } from "@/lib/nav";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireStaff();
  const sections = NAV.map((sec) => ({
    section: sec.section,
    items: sec.items.filter((i) => s.permissions.has(i.permission)).map(({ href, label, icon, phase }) => ({ href, label, icon, phase })),
  })).filter((sec) => sec.items.length > 0);
  const alerts = await getAlerts(s);
  return (
    <div className="lg:pl-64 print:!pl-0">
      <Topbar sections={sections} alerts={alerts} name={s.fullName} role={s.roleName} />
      <main id="main" className="mx-auto max-w-[90rem] px-4 py-6 sm:px-6 lg:py-8 print:p-0">{children}</main>
    </div>
  );
}
