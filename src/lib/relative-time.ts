export function formatRelativeTime(iso: string, locale: string, now: Date = new Date()): string {
  const diffMs = new Date(iso).getTime() - now.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const abs = Math.abs(diffMinutes);
  if (abs < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}
