"use server";

import { createHash, randomBytes, scrypt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withdrawConsent } from "@zentro/commerce/messaging";
import { audit } from "../audit";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

export async function customerAction(_p: ActionResult, form: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const id = z.guid().parse(form.get("customerId"));
    const op = z.enum(["restrict", "restore", "signout", "delete"]).parse(form.get("op"));
    const reason = String(form.get("reason") ?? "").trim().slice(0, 300);
    const s = await authorize("customers.manage", { recentAuth: op !== "signout" });
    const sql = db();
    const [c] = await sql<{ status: string; email: string; phone: string | null }[]>`select status, email, phone from shop.customers where id = ${id}`;
    if (!c || c.status === "deleted") throw new UserError("Customer not found.");
    if (op === "restrict") {
      if (reason.length < 5) throw new UserError("Record why the account is restricted (kept for the audit trail).");
      await sql`update shop.customers set status = 'restricted', restricted_reason = ${reason} where id = ${id}`;
      await sql`update shop.customer_sessions set revoked_at = now() where customer_id = ${id} and revoked_at is null`;
    } else if (op === "restore") {
      await sql`update shop.customers set status = 'active', restricted_reason = null where id = ${id}`;
    } else if (op === "signout") {
      await sql`update shop.customer_sessions set revoked_at = now() where customer_id = ${id} and revoked_at is null`;
    } else {
      // privacy erasure request: same anonymisation as self-service deletion; orders/invoices kept for tax law
      if (form.get("confirm") !== "DELETE") throw new UserError("Type DELETE to confirm the erasure request.");
      for (const [ch, r] of [["email", c.email], ["sms", c.phone], ["whatsapp", c.phone]] as const) {
        if (r) await withdrawConsent(sql, ch, r, "staff_on_request", { reason: "erasure_request" }, s.staffId);
      }
      const junk = await new Promise<string>((res, rej) => scrypt(randomBytes(24), randomBytes(16), 64, (e, k) => (e ? rej(e) : res("scrypt$x$" + k.toString("base64")))));
      await sql.begin(async (tx) => {
        await tx`delete from shop.addresses where user_id = ${id}`;
        await tx`delete from shop.wishlist_items where user_id = ${id}`;
        await tx`delete from shop.carts where user_id = ${id}`;
        await tx`delete from shop.customer_tokens where customer_id = ${id}`;
        await tx`update shop.customer_sessions set revoked_at = now() where customer_id = ${id}`;
        await tx`update shop.reviews set display_name = 'Verified buyer' where user_id = ${id}`;
        await tx`update shop.orders set user_id = null where user_id = ${id}`;
        await tx`update shop.customers set status = 'deleted', email = ${`deleted-${id}@deleted.invalid`}, full_name = 'Deleted customer', phone = null, phone_verified_at = null, password_hash = ${junk} where id = ${id}`;
        await tx`insert into shop.account_deletions (user_id_hash, completed_at) values (${createHash("sha256").update(id).digest("hex")}, now())`;
      });
    }
    await audit(s, { action: `customer.${op}`, entityType: "customer", entityId: id, details: reason ? { reason } : {} });
    if (op === "delete") redirect("/customers?erased=1");
    revalidatePath(`/customers/${id}`);
    return { ok: true, message: { restrict: "Account restricted and signed out.", restore: "Account restored.", signout: "Signed out of all devices.", delete: "Personal data erased. Orders are kept anonymously for tax records." }[op] };
  });
}
