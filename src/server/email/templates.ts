import { appUrl } from "@/server/env";
import type { EmailMessage } from "./transport";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const link = (path: string, token: string) => `${appUrl()}${path}?token=${encodeURIComponent(token)}`;

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }, footer?: string) {
  const text = [
    title,
    "",
    ...paragraphs,
    ...(action ? ["", `${action.label}: ${action.url}`] : []),
    "",
    footer ?? "If you did not expect this email, you can safely ignore it.",
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;color:#111;line-height:1.5">
<div style="max-width:520px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 16px">${escapeHtml(title)}</h2>
${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
${action ? `<p><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 18px;background:#0f9d6a;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(action.label)}</a></p><p style="font-size:12px;color:#555">Or paste this link into your browser:<br>${escapeHtml(action.url)}</p>` : ""}
<p style="font-size:12px;color:#555">${escapeHtml(footer ?? "If you did not expect this email, you can safely ignore it.")}</p>
</div></body></html>`;
  return { text, html };
}

export function verifyEmailMessage(to: string, name: string, token: string): EmailMessage {
  const url = link("/verify-email", token);
  const body = layout(
    "Confirm your email address",
    [`Hi ${name},`, "Please confirm your email address to activate your account. This link expires in 24 hours."],
    { label: "Confirm email", url }
  );
  return { to, subject: "Confirm your email address", ...body };
}

/** Sent instead of a second verification link when someone registers an address that already has an account. */
export function accountAlreadyExistsMessage(to: string): EmailMessage {
  const body = layout(
    "You already have an account",
    [
      "Someone (hopefully you) tried to register with this email address, but an account already exists.",
      "You can sign in, or reset your password if you have forgotten it.",
    ],
    { label: "Go to sign in", url: `${appUrl()}/login` }
  );
  return { to, subject: "You already have an account", ...body };
}

export function passwordResetMessage(to: string, name: string, token: string): EmailMessage {
  const url = link("/reset-password", token);
  const body = layout(
    "Reset your password",
    [
      `Hi ${name},`,
      "We received a request to reset your password. This link expires in 30 minutes and can be used once.",
    ],
    { label: "Choose a new password", url },
    "If you did not request this, ignore this email - your password will not change."
  );
  return { to, subject: "Reset your password", ...body };
}

export function passwordChangedMessage(to: string, name: string): EmailMessage {
  const body = layout(
    "Your password was changed",
    [`Hi ${name},`, "The password for your account was just changed and all other sessions were signed out."],
    { label: "Sign in", url: `${appUrl()}/login` },
    "If this was not you, reset your password immediately and contact your administrator."
  );
  return { to, subject: "Your password was changed", ...body };
}

export function invitationMessage(
  to: string,
  orgName: string,
  inviterName: string,
  roleName: string,
  token: string
): EmailMessage {
  const url = link("/accept-invitation", token);
  const body = layout(
    `Join ${orgName}`,
    [`${inviterName} invited you to join ${orgName} as ${roleName}.`, "This invitation expires in 7 days."],
    { label: "Accept invitation", url }
  );
  return { to, subject: `${inviterName} invited you to ${orgName}`, ...body };
}
