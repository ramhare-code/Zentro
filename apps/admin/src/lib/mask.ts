/** Masks personal data for staff without `customers.pii`. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
export function maskPhone(phone: string): string {
  return phone.length >= 4 ? `••••••${phone.slice(-4)}` : "••••";
}
