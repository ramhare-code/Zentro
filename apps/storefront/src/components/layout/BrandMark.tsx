/**
 * Zentro mark: a bold Z on a violet tile with a warm orange smile beneath it.
 * Path data is exported so the intro animation can draw the same shapes.
 */
export const Z_PATH = "M15 12.5H33L15 30.5H33";
export const SMILE_PATH = "M14.5 35.5C19.5 40.5 28.5 40.5 33.5 35.5";

export function BrandMark({ className = "", id = "bm" }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a42e6" />
          <stop offset="1" stopColor="#43208a" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${id}-bg)`} />
      <path d={Z_PATH} fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={SMILE_PATH} fill="none" stroke="#ffb547" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}
