/**
 * Single source of truth for the platform's brand identity.
 *
 * This is a temporary/placeholder identity for the pre-launch build — swap
 * the values below (and the translated `app.name` / `app.tagline` strings in
 * each `src/locales/*.json` file) to rebrand the whole product. Nothing else
 * in the codebase should hardcode the brand name — always read it from here
 * (non-localized contexts like <head> metadata) or via `t("app.name")`
 * (anywhere inside the React tree, so it stays in sync with the active
 * language).
 */
export const brand = {
  /** Full product name. Keep in sync with `app.name` in every locale file. */
  name: "AutoMind AI",
  /** Short form for tight spaces (favicons, collapsed sidebar, social cards). */
  shortName: "AutoMind",
  /** Keep in sync with `app.tagline` in every locale file. */
  tagline: "AI Car Dealer Agent",
  /** One-sentence description used for <meta name="description">. */
  description: "AI-powered platform for car dealerships, traders, and sales teams.",
  /** Placeholder domain — update once a real domain is registered. */
  domain: "automind.ai",
} as const;
