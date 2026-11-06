import type { Metadata } from "next";
import Link from "next/link";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { getCategories } from "@/lib/catalog";

export const revalidate = 300;
export const metadata: Metadata = { title: "All categories", alternates: { canonical: "/categories" } };

export default async function CategoriesPage() {
  const all = await getCategories();
  const top = all.filter((c) => !c.parentId);
  return (
    <div className="container-page py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">All categories</h1>
      <ul className="mt-6 space-y-10">
        {top.map((c) => {
          const children = all.filter((s) => s.parentId === c.id);
          return (
            <li key={c.id}>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="font-display text-xl font-bold">{c.name}</h2>
                <Link href={`/c/${c.slug}`} className="text-sm font-semibold text-brand-700 hover:underline">Shop all {c.name}</Link>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
                {(children.length ? children : [c]).map((s) => (
                  <li key={s.id}><CategoryCard category={s} /></li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
