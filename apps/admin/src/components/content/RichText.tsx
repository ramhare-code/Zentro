import { fillPlaceholders, parseContent, type Inline } from "@zentro/commerce/content";

type Values = Parameters<typeof fillPlaceholders>[1];

function Inlines({ nodes, values }: { nodes: Inline[]; values: Values }) {
  return nodes.map((n, i) => {
    const v = fillPlaceholders(n.v, values);
    if (n.t === "b") return <strong key={i} className="font-semibold text-ink">{v}</strong>;
    if (n.t === "a") return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline">{v}</a>;
    return <span key={i}>{v}</span>;
  });
}

/** Same parser as the storefront, so the preview matches what customers see. */
export function RichText({ body, values }: { body: string; values: Values }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
      {parseContent(body).map((b, i) => {
        if (b.type === "ul" || b.type === "ol") {
          const Tag = b.type;
          return <Tag key={i} className={`space-y-1 pl-5 ${b.type === "ul" ? "list-disc" : "list-decimal"}`}>{b.items.map((it, j) => <li key={j}><Inlines nodes={it} values={values} /></li>)}</Tag>;
        }
        if (b.type === "h2") return <h2 key={i} className="pt-2 text-base font-bold text-ink"><Inlines nodes={b.text} values={values} /></h2>;
        if (b.type === "h3") return <h3 key={i} className="font-semibold text-ink"><Inlines nodes={b.text} values={values} /></h3>;
        return <p key={i}><Inlines nodes={b.text} values={values} /></p>;
      })}
    </div>
  );
}
