/**
 * Data minimisation for what is sent to an outside AI provider: the agent gets enough to tell two customers
 * apart, not enough to contact or impersonate them. The full details stay in the database and in the UI, where
 * a person who is allowed to see them can.
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  const prefix = phone.trim().startsWith("+") ? "+" : "";
  return `${prefix}${digits.slice(0, 2)}${"*".repeat(Math.max(3, digits.length - 6))}${digits.slice(-4)}`;
}
