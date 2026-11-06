import Link from "next/link";
import { businessInfo } from "@/lib/env";
import { Logo } from "./Logo";
import { CookieSettingsButton } from "../analytics/Analytics";

const columns = [
  { title: "Shop", links: [{ href: "/categories", label: "All categories" }, { href: "/search?sort=newest", label: "New arrivals" }, { href: "/search?sort=popularity", label: "Best sellers" }] },
  { title: "Help", links: [{ href: "/help", label: "Help centre" }, { href: "/account/orders", label: "Track your order" }, { href: "/contact", label: "Contact us" }] },
  { title: "Policies", links: [{ href: "/policies/returns", label: "Returns & refunds" }, { href: "/policies/shipping", label: "Shipping" }, { href: "/policies/privacy", label: "Privacy" }, { href: "/policies/terms", label: "Terms of use" }] },
];

export function SiteFooter() {
  const biz = businessInfo();
  return (
    <footer className="mt-12 border-t border-line bg-white pb-20 lg:pb-0">
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ink-muted">Everything. One place. Thoughtfully chosen products, delivered across India.</p>
          {(biz.supportEmail || biz.supportPhone) && (
            <ul className="mt-4 space-y-1 text-sm">
              {biz.supportEmail && <li><a href={`mailto:${biz.supportEmail}`} className="hover:text-brand-700">{biz.supportEmail}</a></li>}
              {biz.supportPhone && <li><a href={`tel:${biz.supportPhone.replace(/\s/g, "")}`} className="hover:text-brand-700">{biz.supportPhone}</a></li>}
              {biz.supportHours && <li className="text-ink-muted">{biz.supportHours}</li>}
            </ul>
          )}
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink">{col.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href}><Link href={l.href} className="text-ink-muted hover:text-brand-700">{l.label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-1 py-5 text-xs text-ink-muted sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {biz.legalName ?? biz.name}. All rights reserved. · <CookieSettingsButton /></p>
          {(biz.gstin || biz.address) && (
            <p>
              {biz.address}
              {biz.address && biz.gstin && " · "}
              {biz.gstin && `GSTIN ${biz.gstin}`}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
