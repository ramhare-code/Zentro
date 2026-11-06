import type { Metadata } from "next";
import { hasMarketingConsent, normaliseRecipient, verifyUnsubscribe, withdrawConsent, type Channel } from "@zentro/commerce/messaging";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<Channel, string> = { sms: "SMS", whatsapp: "WhatsApp", email: "email" };

async function check(sp: Record<string, string | undefined>) {
  const channel = (["sms", "whatsapp", "email"] as const).find((c) => c === sp.c);
  const secret = process.env.UNSUBSCRIBE_SECRET;
  const recipient = channel && sp.r ? normaliseRecipient(channel, sp.r) : null;
  if (!channel || !recipient || !secret || !sp.s || !verifyUnsubscribe(secret, channel, recipient, sp.s)) return null;
  return { channel, recipient, sig: sp.s };
}

async function unsubscribe(form: FormData) {
  "use server";
  const v = await check({ c: String(form.get("c")), r: String(form.get("r")), s: String(form.get("s")) });
  if (!v) return;
  await withdrawConsent(db(), v.channel, v.recipient, "unsubscribe_link");
  redirect(`/unsubscribe?${new URLSearchParams({ c: v.channel, r: v.recipient, s: v.sig })}`);
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const v = await check(await searchParams);
  if (!v) return <div className="container-page max-w-md py-16 text-center"><h1 className="font-display text-2xl font-bold">This link isn’t valid</h1><p className="mt-2 text-ink-muted">Please use the unsubscribe link from your latest message.</p></div>;
  const subscribed = await hasMarketingConsent(db(), v.channel, v.recipient);
  const masked = v.channel === "email" ? v.recipient.replace(/^(.).*(@.*)$/, "$1•••$2") : `••••••${v.recipient.slice(-4)}`;
  return (
    <div className="container-page max-w-md py-16 text-center">
      {subscribed ? (
        <>
          <h1 className="font-display text-2xl font-bold">Stop {LABEL[v.channel]} offers?</h1>
          <p className="mt-2 text-ink-muted">You won’t receive promotional {LABEL[v.channel]} messages at {masked} any more. Order and delivery updates are not affected.</p>
          <form action={unsubscribe} className="mt-6">
            <input type="hidden" name="c" value={v.channel} /><input type="hidden" name="r" value={v.recipient} /><input type="hidden" name="s" value={v.sig} />
            <button className="h-11 rounded-full bg-brand-600 px-6 font-semibold text-white">Unsubscribe</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold">You’re unsubscribed</h1>
          <p className="mt-2 text-ink-muted">{masked} will not receive promotional {LABEL[v.channel]} messages. You can opt in again at your next checkout.</p>
        </>
      )}
    </div>
  );
}
