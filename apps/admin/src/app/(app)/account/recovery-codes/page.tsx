import { cookies } from "next/headers";
import Link from "next/link";
import { decrypt } from "@/lib/crypto";
import { adminEnv } from "@/lib/env";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Recovery codes" };

export default async function RecoveryCodesPage() {
  await requireStaff();
  const raw = (await cookies()).get("zentro_admin_rc")?.value;
  let codes: string[] = [];
  try {
    codes = raw ? (JSON.parse(decrypt(raw, adminEnv().ADMIN_ENCRYPTION_KEY)) as string[]) : [];
  } catch {
    codes = [];
  }
  return (
    <div className="card mx-auto mt-6 max-w-md space-y-4 p-8">
      <h1 className="text-xl font-bold">Save your recovery codes</h1>
      {codes.length ? (
        <>
          <p className="text-sm text-ink-muted">If you lose your phone, each code lets you sign in once. They are shown only now — store them in a password manager.</p>
          <ul className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-4 font-mono text-sm" aria-label="Recovery codes">
            {codes.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </>
      ) : (
        <p className="text-sm text-ink-muted">Recovery codes are shown only once, right after setup. If you didn’t save them, ask an Owner to reset your access.</p>
      )}
      <Link href="/dashboard" className="btn btn-primary h-11 w-full">I’ve saved them — continue</Link>
    </div>
  );
}
