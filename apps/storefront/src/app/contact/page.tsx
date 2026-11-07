import type { Metadata } from "next";
import { getBusiness } from "@/lib/settings";

export const metadata: Metadata = { title: "Contact us", alternates: { canonical: "/contact" } };

export default async function ContactPage() {
  const b = await getBusiness();
  const rows: [string, React.ReactNode][] = [];
  if (b.supportEmail) rows.push(["Email", <a key="e" href={`mailto:${b.supportEmail}`} className="font-semibold text-brand-700 hover:underline">{b.supportEmail}</a>]);
  if (b.supportPhone) rows.push(["Phone", <a key="p" href={`tel:${b.supportPhone.replace(/\s/g, "")}`} className="font-semibold text-brand-700 hover:underline">{b.supportPhone}</a>]);
  if (b.supportHours) rows.push(["Hours", b.supportHours]);
  if (b.legalName) rows.push(["Registered name", b.legalName]);
  if (b.address) rows.push(["Address", <span key="a" className="whitespace-pre-line">{b.address}</span>]);
  if (b.gstin) rows.push(["GSTIN", b.gstin]);
  if (b.grievanceOfficer) rows.push(["Grievance officer", <>{b.grievanceOfficer.name}{b.grievanceOfficer.email && <> · <a href={`mailto:${b.grievanceOfficer.email}`} className="text-brand-700 hover:underline">{b.grievanceOfficer.email}</a></>}</>]);

  return (
    <div className="container-page max-w-2xl py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Contact us</h1>
      {rows.length ? (
        <dl className="mt-6 divide-y divide-line rounded-card bg-white ring-1 ring-line">
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-5 sm:grid-cols-[10rem_1fr]">
              <dt className="text-sm text-ink-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-ink-muted">Contact details have not been configured yet.</p>
      )}
    </div>
  );
}
