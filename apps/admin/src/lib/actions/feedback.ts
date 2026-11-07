"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "../audit";
import { db } from "../db";
import { authorize } from "../session";
import { guarded, UserError, type ActionResult } from "./result";

export async function updateFeedbackAction(_p: ActionResult, f: FormData): Promise<ActionResult> {
  return guarded(async () => {
    const s = await authorize("support.manage");
    const [st, rawId] = String(f.get("op") ?? "").split(":");
    const id = z.coerce.number().int().positive().parse(rawId);
    const status = z.enum(["new", "reviewed", "archived"]).parse(st);
    const note = String(f.get("note") ?? "").trim().slice(0, 1000) || null;
    const [r] = await db()<{ id: number }[]>`
      update shop.site_feedback set status = ${status}, staff_note = coalesce(${note}, staff_note), handled_by = ${s.staffId}, handled_at = now() where id = ${id} returning id`;
    if (!r) throw new UserError("Feedback not found.");
    await audit(s, { action: "feedback.update", entityType: "feedback", entityId: String(id), details: { status } });
    revalidatePath("/support/feedback");
    return { ok: true, message: status === "reviewed" ? "Marked as reviewed." : status === "archived" ? "Archived." : "Moved back to new." };
  });
}
