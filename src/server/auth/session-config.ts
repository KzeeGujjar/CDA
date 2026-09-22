/**
 * Session strategy: opaque server-side sessions (no JWTs, no refresh tokens).
 *  - IDLE timeout: a session dies after 8 hours without activity.
 *  - Sliding renewal: activity pushes the expiry forward (at most every 5 minutes)...
 *  - ABSOLUTE cap: ...but never beyond 14 days from login; after that the user signs in again.
 *  - Every login mints a NEW token (no session fixation); password change/reset revokes sessions.
 * Because the record is server-side, sign-out, suspension and role changes are immediate.
 */
export const SESSION_IDLE_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_AFTER_MS = 5 * 60 * 1000;
