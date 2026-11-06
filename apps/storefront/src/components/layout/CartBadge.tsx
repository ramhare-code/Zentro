"use client";

import { useEffect, useState } from "react";

const read = () => Number(document.cookie.split("; ").find((c) => c.startsWith("zentro_cart_n="))?.split("=")[1] ?? 0) || 0;

/** Cart count from a non-sensitive cookie, so cached pages can still show it. */
export function CartBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const update = () => setN(read());
    update();
    window.addEventListener("zentro:cart", update);
    window.addEventListener("focus", update);
    return () => {
      window.removeEventListener("zentro:cart", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  if (!n) return null;
  return (
    <span className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-accent-400 px-1 text-[0.7rem] font-bold text-ink">
      {n > 99 ? "99+" : n}<span className="sr-only"> items in cart</span>
    </span>
  );
}
