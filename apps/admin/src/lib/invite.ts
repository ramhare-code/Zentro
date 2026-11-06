import "server-only";
import QRCode from "qrcode";
import { sha256 } from "./crypto";
import { db } from "./db";
import { otpauthUri } from "./totp";

interface InviteRow { inviteId: string; staffId: string; email: string; fullName: string; hasPassword: boolean; secretEnc: string | null }

export async function loadInvite(token: string): Promise<InviteRow | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const [row] = await db()<InviteRow[]>`
    select i.id as "inviteId", u.id as "staffId", u.email, u.full_name as "fullName",
           (u.password_hash is not null) as "hasPassword", u.totp_secret_enc as "secretEnc"
    from shop.staff_invites i join shop.staff_users u on u.id = i.staff_id
    where i.token_hash = ${sha256(token)} and i.used_at is null and i.expires_at > now() and u.status = 'invited'`;
  return row ?? null;
}

export async function inviteQr(email: string, secret: string) {
  return QRCode.toString(otpauthUri(secret, email, "Zentro Admin"), { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "M" });
}
