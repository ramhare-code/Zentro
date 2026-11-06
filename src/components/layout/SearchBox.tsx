"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon } from "../icons";
import { formatPaise } from "@/lib/money";

interface Suggestion {
  products: { slug: string; name: string; imageUrl: string | null; minPricePaise: number }[];
  categories: { slug: string; name: string }[];
  correctedQuery?: string;
}

type Option = { key: string; href: string; label: string; kind: "product" | "category" | "query"; imageUrl?: string | null; price?: number };

export function SearchBox({ className = "" }: { className?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [data, setData] = useState<Suggestion | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setData(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) setData(await res.json());
      } catch {
        /* aborted or offline — suggestions are optional */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const options: Option[] = [];
  if (data?.correctedQuery) {
    options.push({ key: "fix", kind: "query", label: data.correctedQuery, href: `/search?q=${encodeURIComponent(data.correctedQuery)}` });
  }
  for (const c of data?.categories ?? []) options.push({ key: `c-${c.slug}`, kind: "category", label: c.name, href: `/c/${c.slug}` });
  for (const p of data?.products ?? [])
    options.push({ key: `p-${p.slug}`, kind: "product", label: p.name, href: `/p/${p.slug}`, imageUrl: p.imageUrl, price: p.minPricePaise });

  const showList = open && q.trim().length >= 2 && options.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const chosen = active >= 0 ? options[active] : undefined;
    setOpen(false);
    if (chosen) router.push(chosen.href);
    else if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <form role="search" onSubmit={submit} action="/search">
        <label htmlFor={`${listId}-input`} className="sr-only">Search products</label>
        <div className="flex h-11 items-center gap-2 rounded-full bg-canvas px-4 ring-1 ring-line focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-500">
          <SearchIcon size={19} className="shrink-0 text-ink-subtle" />
          <input
            id={`${listId}-input`}
            name="q"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search for products, brands and more"
            autoComplete="off"
            maxLength={100}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            className="w-full bg-transparent text-[0.95rem] text-ink placeholder:text-ink-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </form>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Search suggestions" className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-white py-2 shadow-pop ring-1 ring-line">
          {options.map((o, i) => (
            <li key={o.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <Link
                href={o.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-2 text-sm ${i === active ? "bg-brand-50" : "hover:bg-canvas"}`}
              >
                {o.kind === "product" ? (
                  <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-brand-50">
                    {o.imageUrl && <Image src={o.imageUrl} alt="" fill sizes="40px" className="object-cover" />}
                  </span>
                ) : (
                  <SearchIcon size={16} className="mx-3 shrink-0 text-ink-subtle" />
                )}
                <span className="min-w-0 flex-1">
                  {o.kind === "query" && <span className="text-ink-muted">Did you mean </span>}
                  <span className="font-medium text-ink">{o.label}</span>
                  {o.kind === "category" && <span className="text-ink-muted"> in categories</span>}
                </span>
                {o.price !== undefined && <span className="shrink-0 font-semibold">{formatPaise(o.price)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
