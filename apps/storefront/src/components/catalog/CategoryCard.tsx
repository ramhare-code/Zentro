import Image from "next/image";
import Link from "next/link";
import type { Category } from "@/lib/catalog";

export function CategoryCard({ category }: { category: Category }) {
  return (
    <Link
      href={`/c/${category.slug}`}
      className="group relative flex aspect-[4/5] overflow-hidden rounded-card bg-brand-100 shadow-card sm:aspect-[4/3]"
    >
      {category.imageUrl && (
        <Image
          src={category.imageUrl}
          alt=""
          fill
          sizes="(min-width: 1024px) 25vw, 50vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-brand-900/85 via-brand-900/25 to-transparent" />
      <span className="relative mt-auto p-4 text-white sm:p-5">
        <span className="block font-display text-lg font-bold sm:text-xl">{category.name}</span>
        {category.description && <span className="mt-0.5 hidden text-sm text-white/85 sm:block">{category.description}</span>}
        <span className="mt-2 inline-block text-sm font-semibold underline-offset-4 group-hover:underline">Shop now →</span>
      </span>
    </Link>
  );
}
