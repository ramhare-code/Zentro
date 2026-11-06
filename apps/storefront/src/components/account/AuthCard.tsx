export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="container-page grid min-h-[60vh] place-items-center py-10">
      <div className="w-full max-w-md rounded-card bg-white p-6 shadow-card ring-1 ring-line sm:p-8">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
