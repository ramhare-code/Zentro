"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { gstinProblem, STATE_CODES } from "@zentro/commerce";
import { audit } from "../audit";
import { GST_RATES, revalidateWholeStorefront } from "../catalog-admin";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

const str = (f: FormData, k: string, max = 400) => String(f.get(k) ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const email = (v: string, label: string) => { if (v && !z.string().email().safeParse(v).success) throw new UserError(`${label} isn’t a valid email address.`); return v || null; };

/** Business details. Changing the GST registration (GSTIN or state) needs a fresh sign-in. */
export async function saveStoreDetailsAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    let s = await authorize("settings.manage");
    const sql = db();
    const [cur] = await sql<{ gstin: string | null; stateCode: string | null }[]>`select gstin, state_code as "stateCode" from shop.store_settings where id`;
    const gstin = str(f, "gstin", 15).toUpperCase() || null;
    const stateCode = str(f, "stateCode", 2).toUpperCase() || null;
    if (stateCode && !STATE_CODES.includes(stateCode)) throw new UserError("Choose your state of GST registration.");
    if (gstin) { const p = gstinProblem(gstin, stateCode); if (p) throw new UserError(p); }
    if (gstin && !stateCode) throw new UserError("Choose the state your GSTIN is registered in.");
    if (gstin !== cur?.gstin || stateCode !== cur?.stateCode) s = await authorize("settings.manage", { recentAuth: true });
    const days = Number(str(f, "returnWindowDays", 3) || 7);
    if (!Number.isInteger(days) || days < 0 || days > 60) throw new UserError("Return window must be 0–60 days.");
    const row = {
      business_name: str(f, "businessName", 60) || null, legal_name: str(f, "legalName", 120) || null, address: str(f, "address", 400) || null,
      gstin, state_code: stateCode,
      support_email: email(str(f, "supportEmail", 200).toLowerCase(), "Support email"), support_phone: str(f, "supportPhone", 20) || null,
      support_hours: str(f, "supportHours", 80) || null, grievance_name: str(f, "grievanceName", 100) || null,
      grievance_email: email(str(f, "grievanceEmail", 200).toLowerCase(), "Grievance officer email"), return_window_days: days, updated_by: s.staffId,
    };
    if (row.business_name !== null && row.business_name.length < 2) throw new UserError("Store name is too short.");
    await sql`update shop.store_settings set ${sql(row)} where id`;
    await audit(s, { action: "settings.store", details: { changed: Object.keys(row).filter((k) => k !== "updated_by"), gstChanged: gstin !== cur?.gstin || stateCode !== cur?.stateCode } });
    await revalidateWholeStorefront();
    revalidatePath("/settings");
    return { ok: true, message: "Saved. The store shows the new details within a few minutes; invoices already issued keep the details they were issued with." };
  });
}

// ------------------------------------------------------------------ shipping

const rupeesToPaise = (raw: string, label: string, required = false): number | null => {
  const v = raw.replace(/[₹,\s]/g, "");
  if (!v) { if (required) throw new UserError(`Enter ${label}.`); return null; }
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new UserError(`${label[0]!.toUpperCase() + label.slice(1)} must be an amount in rupees.`);
  return Math.round(Number(v) * 100);
};

export async function saveShippingRateAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("settings.manage");
    const id = z.guid().safeParse(f.get("rateId")).data ?? null;
    const name = str(f, "name", 60);
    if (name.length < 2) throw new UserError("Name the rate, e.g. “Standard” or “Free over ₹999”.");
    const states = f.getAll("stateCodes").map(String).filter((c) => STATE_CODES.includes(c));
    const prefixes = [...new Set(str(f, "pincodePrefixes", 2000).split(/[\s,]+/).filter(Boolean))];
    if (prefixes.some((p) => !/^[1-9][0-9]{0,5}$/.test(p))) throw new UserError("Pincode prefixes are 1–6 digits, e.g. 560 or 110001.");
    const min = rupeesToPaise(str(f, "minSubtotal", 20), "the minimum order") ?? 0;
    const max = rupeesToPaise(str(f, "maxSubtotal", 20), "the maximum order");
    if (max !== null && max < min) throw new UserError("The maximum order must be more than the minimum.");
    const dmin = Number(str(f, "daysMin", 3)), dmax = Number(str(f, "daysMax", 3));
    if (!Number.isInteger(dmin) || !Number.isInteger(dmax) || dmin < 0 || dmax < dmin || dmax > 60) throw new UserError("Delivery days: whole numbers, and “to” at least “from”.");
    const row = {
      name, state_codes: states.length ? states : null, pincode_prefixes: prefixes.length ? prefixes : null,
      min_subtotal_paise: min, max_subtotal_paise: max, fee_paise: rupeesToPaise(str(f, "fee", 20), "the delivery charge", true)!,
      est_days_min: dmin, est_days_max: dmax, priority: z.coerce.number().int().min(0).max(10000).catch(100).parse(f.get("priority") || 100),
      is_active: f.get("isActive") === "on", updated_at: new Date(),
    };
    const sql = db();
    const saved = id
      ? (await sql<{ id: string }[]>`update shop.shipping_rates set ${sql(row)} where id = ${id} returning id`)[0]?.id
      : (await sql<{ id: string }[]>`insert into shop.shipping_rates ${sql(row)} returning id`)[0]!.id;
    if (!saved) throw new UserError("Rate not found.");
    await audit(s, { action: id ? "shipping_rate.update" : "shipping_rate.create", entityType: "shipping_rate", entityId: saved, details: { name, fee: row.fee_paise, active: row.is_active } });
    revalidatePath("/settings/shipping");
    return { ok: true, message: "Shipping rate saved. Checkout uses it immediately." };
  });
}

export async function deleteShippingRateAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("settings.manage");
    const id = z.guid().parse(f.get("rateId"));
    const sql = db();
    const [left] = await sql<{ n: number }[]>`select count(*)::int as n from shop.shipping_rates where is_active and id <> ${id}`;
    if (!left!.n) throw new UserError("Keep at least one active rate, or customers can’t check out.");
    const [r] = await sql<{ name: string }[]>`delete from shop.shipping_rates where id = ${id} returning name`;
    if (!r) throw new UserError("Rate not found.");
    await audit(s, { action: "shipping_rate.delete", entityType: "shipping_rate", entityId: id, details: { name: r.name } });
    revalidatePath("/settings/shipping");
    return { ok: true, message: "Deleted." };
  });
}

/** Adds or removes pincodes the business can't deliver to (pasted list). */
export async function pincodesAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("settings.manage");
    const op = f.get("op") === "remove" ? "remove" : "add";
    const codes = [...new Set(str(f, "pincodes", 20000).split(/[\s,]+/).filter(Boolean))];
    if (!codes.length) throw new UserError("Paste one or more 6-digit pincodes.");
    const bad = codes.filter((c) => !/^[1-9][0-9]{5}$/.test(c));
    if (bad.length) throw new UserError(`Not valid pincodes: ${bad.slice(0, 5).join(", ")}${bad.length > 5 ? "…" : ""}`);
    if (codes.length > 2000) throw new UserError("Up to 2,000 at a time.");
    const sql = db();
    const reason = str(f, "reason", 100) || null;
    const n = op === "add"
      ? (await sql`insert into shop.unserviceable_pincodes ${sql(codes.map((pincode) => ({ pincode, reason })))} on conflict (pincode) do update set reason = excluded.reason`).count
      : (await sql`delete from shop.unserviceable_pincodes where pincode = any(${codes})`).count;
    await audit(s, { action: `pincodes.${op}`, details: { count: n } });
    revalidatePath("/settings/shipping");
    return { ok: true, message: op === "add" ? `${n} pincode(s) blocked from checkout.` : `${n} pincode(s) can order again.` };
  });
}

// ------------------------------------------------------------------ tax

export async function saveTaxSettingsAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("tax.manage", { recentAuth: true });
    const mode = f.get("shippingGstMode") === "highest_item_rate" ? "highest_item_rate" : "none";
    await db()`update shop.store_settings set shipping_gst_mode = ${mode}, updated_by = ${s.staffId} where id`;
    await audit(s, { action: "settings.tax", details: { shippingGstMode: mode } });
    revalidatePath("/settings/tax");
    return { ok: true, message: mode === "none" ? "Shipping is now charged without GST on new orders." : "New orders include GST on shipping at the highest item rate. Existing orders and invoices are unchanged." };
  });
}

/** Saves HSN codes and GST rates edited in the product table (only changed rows). */
export async function saveProductTaxAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("tax.manage");
    const sql = db();
    const ids = [...new Set([...f.keys()].filter((k) => k.startsWith("hsn:")).map((k) => k.slice(4)))].filter((id) => z.guid().safeParse(id).success);
    const current = await sql<{ id: string; hsn: string | null; rate: string; name: string }[]>`select id, hsn_code as hsn, gst_rate::text as rate, name from shop.products where id = any(${ids}::uuid[])`;
    const changes: { id: string; hsn: string | null; rate: number }[] = [];
    for (const c of current) {
      const hsn = str(f, `hsn:${c.id}`, 8) || null;
      const rate = Number(str(f, `gst:${c.id}`, 5));
      if (hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(hsn)) throw new UserError(`${c.name}: HSN codes are 4, 6 or 8 digits.`);
      if (!(GST_RATES as readonly number[]).includes(rate)) throw new UserError(`${c.name}: choose a valid GST rate.`);
      if (hsn !== c.hsn || rate !== Number(c.rate)) changes.push({ id: c.id, hsn, rate });
    }
    if (!changes.length) return { ok: true, message: "Nothing changed." };
    await sql.begin(async (tx) => {
      for (const c of changes) await tx`update shop.products set hsn_code = ${c.hsn}, gst_rate = ${c.rate}, updated_by = ${s.staffId} where id = ${c.id}`;
      await audit(s, { action: "tax.products", details: { changed: changes.length, products: changes.slice(0, 50) } }, tx);
    });
    revalidatePath("/settings/tax");
    return { ok: true, message: `Updated ${changes.length} product(s). New orders use the new rates; past invoices are unchanged.` };
  });
}
