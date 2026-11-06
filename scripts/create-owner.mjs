// Creates the first Owner account and prints a one-time invitation link.
// Run from a trusted machine with production DATABASE_URL — this is the only
// way to create an owner; there is no public sign-up for the admin.
//
//   DATABASE_URL=... ADMIN_URL=https://admin.example.com \
//     node scripts/create-owner.mjs --email you@example.com --name "Your Name"
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const { DATABASE_URL, ADMIN_URL } = process.env;

if (!DATABASE_URL || !ADMIN_URL || !email || !name) {
  console.error('Usage: DATABASE_URL=... ADMIN_URL=... node scripts/create-owner.mjs --email you@example.com --name "Your Name"');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error("Invalid email."); process.exit(1); }

const sql = postgres(DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const token = randomBytes(32).toString("base64url");
  await sql.begin(async (tx) => {
    const [existing] = await tx`
      select count(*)::int as n from shop.staff_users u join shop.admin_roles r on r.id = u.role_id
      where r.key = 'owner' and u.status <> 'disabled'`;
    if (existing.n > 0 && !process.argv.includes("--additional")) {
      throw new Error("An owner already exists. Existing owners should invite staff from the admin. Use --additional only for recovery.");
    }
    const [u] = await tx`
      insert into shop.staff_users (email, full_name, role_id)
      values (${email}, ${name}, (select id from shop.admin_roles where key = 'owner'))
      on conflict (email) do update set status = 'invited', password_hash = null, totp_secret_enc = null, totp_enabled_at = null
      returning id`;
    await tx`update shop.staff_invites set used_at = now() where staff_id = ${u.id} and used_at is null`;
    await tx`insert into shop.staff_invites (staff_id, token_hash, expires_at)
             values (${u.id}, ${createHash("sha256").update(token).digest("hex")}, now() + interval '72 hours')`;
    await tx`insert into shop.audit_log (action, entity_type, entity_id, details)
             values ('staff.owner_bootstrap', 'staff', ${u.id}, ${tx.json({ email, via: "cli" })})`;
  });
  console.log(`\nOwner invitation created for ${email}. Open this link within 72 hours:\n\n  ${ADMIN_URL.replace(/\/$/, "")}/invite/${token}\n`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
