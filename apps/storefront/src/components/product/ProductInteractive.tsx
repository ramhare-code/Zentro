"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { addToCartAction } from "@/lib/actions/cart";
import { track } from "@/lib/analytics-client";
import clsx from "clsx";
import type { Media, Variant } from "@/lib/catalog";
import { Price } from "../catalog/Price";
import { StockBadge } from "../catalog/StockBadge";
import { Gallery } from "./Gallery";

interface Props {
  productId: string;
  productName: string;
  media: Media[];
  variants: Variant[];
  optionNames: string[];
  header: React.ReactNode;
}

export function ProductInteractive({ productId, productName, media, variants, optionNames, header }: Props) {
  const initial = variants.find((v) => v.stock > 0) ?? variants[0]!;
  const [selected, setSelected] = useState<Record<string, string>>(initial.options);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Deep link: ?variant=SKU selects that variant.
  useEffect(() => {
    const sku = new URLSearchParams(window.location.search).get("variant");
    const v = sku && variants.find((x) => x.sku === sku);
    if (v) setSelected(v.options);
  }, [variants]);

  const variant = useMemo(
    () => variants.find((v) => optionNames.every((n) => v.options[n] === selected[n])) ?? null,
    [variants, optionNames, selected],
  );

  useEffect(() => {
    if (!variant || variants.length < 2) return;
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant.sku);
    window.history.replaceState(null, "", url);
  }, [variant, variants.length]);

  const valuesFor = (name: string) => [...new Set(variants.map((v) => v.options[name]).filter((x): x is string => !!x))];

  /** A value is available if some in-stock variant has it together with the other current selections. */
  const isAvailable = (name: string, value: string) =>
    variants.some((v) => v.options[name] === value && v.stock > 0 && optionNames.every((n) => n === name || v.options[n] === selected[n]));

  const choose = (name: string, value: string) => {
    const next = { ...selected, [name]: value };
    // if that exact combination does not exist, fall back to the closest existing variant with this value
    if (!variants.some((v) => optionNames.every((n) => v.options[n] === next[n]))) {
      const fallback = variants.find((v) => v.options[name] === value && v.stock > 0) ?? variants.find((v) => v.options[name] === value);
      if (fallback) return setSelected(fallback.options);
    }
    setSelected(next);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
      <Gallery media={media} activeId={variant?.mediaId} productName={productName} />

      <div>
        {header}
        <div className="mt-5 rounded-card bg-white p-5 ring-1 ring-line">
          {variant ? (
            <>
              {variant.promotionBadge && (
                <p className="mb-2 inline-flex flex-wrap items-center gap-2 rounded-full bg-danger-50 px-3 py-1 text-xs font-bold text-danger-700">
                  {variant.promotionBadge}
                  {variant.promotionEndsAt && <span className="font-medium">· ends {new Date(variant.promotionEndsAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>}
                </p>
              )}
              <Price pricePaise={variant.pricePaise} mrpPaise={variant.mrpPaise} size="lg" />
              <p className="mt-1 text-xs text-ink-muted">Inclusive of all taxes</p>
              <StockBadge stock={variant.stock} className="mt-3" />
            </>
          ) : (
            <p className="font-semibold text-danger-700">This combination is not available.</p>
          )}

          {optionNames.map((name) => (
            <fieldset key={name} className="mt-6">
              <legend className="mb-2 text-sm font-semibold">
                {name}: <span className="font-normal text-ink-muted">{selected[name]}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {valuesFor(name).map((value) => {
                  const active = selected[name] === value;
                  const available = isAvailable(name, value);
                  return (
                    <label
                      key={value}
                      className={clsx(
                        "relative inline-flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-semibold ring-1 transition has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-brand-500",
                        active ? "bg-brand-50 text-brand-800 ring-2 ring-brand-600" : "bg-white ring-line-strong hover:ring-brand-300",
                        !available && "text-ink-subtle line-through decoration-1",
                      )}
                    >
                      <input type="radio" name={`opt-${name}`} value={value} checked={active} onChange={() => choose(name, value)} className="sr-only" />
                      {value}
                      {!available && <span className="sr-only"> (out of stock)</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {variant && variant.stock > 0 && (
            <label className="mt-6 flex items-center gap-3 text-sm font-semibold">
              Quantity
              <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-10 rounded-xl bg-white px-3 ring-1 ring-line-strong">
                {Array.from({ length: Math.min(10, variant.stock) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!variant || variant.stock <= 0 || pending}
              onClick={() => variant && start(async () => {
                const r = await addToCartAction(variant.id, qty);
                setMsg(r.ok ? { ok: true, text: "Added to your cart." } : { ok: false, text: r.error ?? "Couldn’t add to cart." });
                if (r.ok) { window.dispatchEvent(new Event("zentro:cart")); track("add_to_cart", { productId, valuePaise: variant.pricePaise * qty }); }
              })}
              className="h-12 rounded-full bg-white font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add to cart"}
            </button>
            <button
              type="button"
              disabled={!variant || variant.stock <= 0}
              onClick={() => { if (variant) { track("add_to_cart", { productId, valuePaise: variant.pricePaise * qty }); router.push(`/checkout?buy=${variant.id}&qty=${qty}`); } }}
              className="h-12 rounded-full bg-accent-400 font-semibold text-ink hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Buy now
            </button>
          </div>
          <div aria-live="polite" className="min-h-6">
            {msg && (
              <p className={`mt-3 text-center text-sm font-medium ${msg.ok ? "text-success-700" : "text-danger-700"}`}>
                {msg.text} {msg.ok && <Link href="/cart" className="underline">View cart</Link>}
              </p>
            )}
          </div>
          {variant && <p className="mt-4 text-xs text-ink-subtle">SKU: {variant.sku}</p>}
        </div>
      </div>
    </div>
  );
}
