import "server-only";
import { AuthorizationError } from "../session";

export type ActionResult = { ok?: boolean; error?: string; needsReauth?: boolean; message?: string; secret?: string } | undefined;

/** Turns authorisation and validation failures into user-facing results; never leaks internals. */
export async function guarded(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (e.permission === "recent_auth") return { error: "Please confirm it’s you to continue.", needsReauth: true };
      if (e.permission === "authenticated") return { error: "Your session has ended. Please sign in again." };
      return { error: "You don’t have permission to do that." };
    }
    if (e instanceof UserError) return { error: e.message };
    // Next.js redirect()/notFound() are signalled by throwing; let them through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { error: "Something went wrong. The change was not saved." };
  }
}

export class UserError extends Error {}
