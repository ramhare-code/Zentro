export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-sidebar px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5 text-white">
          <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-extrabold">Z</span>
          <span className="text-xl font-bold tracking-tight">Zentro <span className="font-medium text-white/60">Admin</span></span>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-pop sm:p-8">{children}</div>
        <p className="mt-6 text-center text-xs text-white/50">Authorised staff only. All access is logged.</p>
      </div>
    </div>
  );
}
