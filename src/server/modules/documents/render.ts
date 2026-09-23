const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function lookup(vars: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), vars);
}

/** Every distinct {{path}} token a template's content uses, in first-seen order — for a future template editor. */
export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const m of template.matchAll(TOKEN_RE)) seen.add(m[1]);
  return [...seen];
}

/**
 * A deliberately minimal renderer: {{path.to.value}} is looked up in `vars` (a plain object the server built
 * from real records) and substituted as text. There is no expression language, no loop, no conditional and
 * nothing is ever executed — a template can only display a value the server already computed, never run
 * arbitrary logic, so a custom template can never become a code-injection surface.
 */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replace(TOKEN_RE, (_, path: string) => {
    const value = lookup(vars, path);
    return value === undefined || value === null ? "" : String(value);
  });
}
