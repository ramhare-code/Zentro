"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { isWishlisted, toggleWishlistAction } from "@/lib/actions/engage";
import { HeartIcon } from "../icons";

export function WishlistButton({ productId, slug }: { productId: string; slug: string }) {
  const [saved, setSaved] = useState(false);
  // product pages are cached for everyone, so personal state is loaded after render
  useEffect(() => { void isWishlisted(productId).then(setSaved); }, [productId]);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      aria-pressed={saved}
      disabled={pending}
      onClick={() => start(async () => {
        const r = await toggleWishlistAction(productId);
        if (r.needsLogin) router.push(`/account/login?next=/p/${slug}`);
        else if (r.ok) setSaved(!!r.saved);
      })}
      className={clsx("inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-inset", saved ? "bg-danger-50 text-danger-700 ring-danger-700/30" : "bg-white text-ink ring-line-strong hover:bg-canvas")}
    >
      <HeartIcon size={18} className={saved ? "fill-current" : ""} />
      {saved ? "Saved to wishlist" : "Save to wishlist"}
    </button>
  );
}
