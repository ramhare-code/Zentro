"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveToCartAction, toggleWishlistAction } from "@/lib/actions/engage";

export function WishlistItemActions({ productId, slug, inStock, singleVariant }: { productId: string; slug: string; inStock: boolean; singleVariant: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {inStock && singleVariant && (
        <button type="button" disabled={pending} onClick={() => start(async () => {
          const r = await moveToCartAction(productId);
          if (r.ok) { window.dispatchEvent(new Event("zentro:cart")); router.refresh(); } else setMsg(r.error ?? "Couldn’t move to cart.");
        })} className="h-9 rounded-full bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-60">Move to cart</button>
      )}
      {inStock && !singleVariant && <a href={`/p/${slug}`} className="h-9 rounded-full bg-brand-600 px-4 pt-2 text-sm font-semibold text-white">Choose options</a>}
      <button type="button" disabled={pending} onClick={() => start(async () => { await toggleWishlistAction(productId); router.refresh(); })} className="text-sm font-semibold text-danger-700 hover:underline">Remove</button>
      {msg && <span role="alert" className="text-sm text-danger-700">{msg}</span>}
    </div>
  );
}
