import type { ApiError } from "@/types/common";
import type { AuthSession, AuthUser, LoginCredentials, SignUpInput } from "@/types/auth";
import { currentUserFixture } from "@/mock/auth";
import { backendMode, backendRequest, isUnavailable, resetBackendMode } from "@/services/backend";

/** The built-in demo user, shown until a real session is found. */
export const getDemoUser = (): AuthUser => currentUserFixture;

/**
 * Whether the app is currently live (a real session) or demo (services/backend.ts's `liveOrDemo`). Frontend code
 * outside src/services may not import services/backend directly (see eslint.config.mjs); this is the one
 * sanctioned way to ask, for the rare feature — uploading a real vehicle photo, for one — that has no demo
 * equivalent at all and needs to know up front instead of letting every action fail with a confusing 401.
 */
export { backendMode };

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

interface BackendUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

const toAuthUser = (u: BackendUser): AuthUser => ({ ...u, role: u.role as AuthUser["role"] });

/**
 * Sign in against the real backend when there is one. The session is an httpOnly cookie set by the server, so no
 * token is kept here. Where no backend answers (a deployment without a database, local UI-only work) the original
 * demo sign-in below still works, so the app stays usable.
 */
export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  if (!credentials.email.trim() || !credentials.password.trim()) {
    await wait();
    const error: ApiError = { message: "Email and password are required.", code: "invalid_credentials", status: 400 };
    throw error;
  }
  const result = await backendRequest<{ user: BackendUser; expiresAt: string }>("POST", "/auth/login", {
    email: credentials.email.trim(),
    password: credentials.password,
  });
  if (result.kind === "ok") {
    resetBackendMode();
    return { user: toAuthUser(result.data.user), token: "", expiresAt: result.data.expiresAt };
  }
  if (!isUnavailable(result) && result.kind === "error") throw result.error;
  await wait();
  return {
    user: { ...currentUserFixture, email: credentials.email },
    token: `mock-token-${Math.random().toString(36).slice(2, 10)}`,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
  };
}

export async function logout(): Promise<void> {
  await backendRequest("POST", "/auth/logout", {});
  resetBackendMode();
  await wait(150);
}

/** The signed-in user according to the server, or null when there is no real session (demo mode). */
export async function getBackendUser(): Promise<AuthUser | null> {
  const result = await backendRequest<{ user: BackendUser }>("GET", "/auth/me");
  return result.kind === "ok" ? toAuthUser(result.data.user) : null;
}

export async function getCurrentUser(): Promise<AuthSession> {
  await wait(150);
  return {
    user: currentUserFixture,
    token: "mock-token-session",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
  };
}

/**
 * Mock password-reset request — no email is actually sent. A real backend
 * integration replaces this body with a call that emails a reset link;
 * the login page's call site is already written against this contract.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  await wait();
  if (!email.trim()) {
    const error: ApiError = { message: "Email is required.", code: "invalid_email", status: 400 };
    throw error;
  }
}

/**
 * Mock sign-up — no account is actually created or persisted anywhere; the
 * entered details only seed a local session for this browser tab. A real
 * backend integration replaces this body with a call that creates the
 * account server-side; the login page's call site is already written
 * against this contract.
 */
export async function signUp(input: SignUpInput): Promise<AuthSession> {
  await wait();
  if (!input.name.trim() || !input.email.trim() || !input.password.trim()) {
    const error: ApiError = { message: "Name, email, and password are required.", code: "invalid_signup", status: 400 };
    throw error;
  }
  return {
    user: {
      ...currentUserFixture,
      id: `u-${Math.random().toString(36).slice(2, 9)}`,
      name: input.name,
      email: input.email,
      role: "salesperson",
    },
    token: `mock-token-${Math.random().toString(36).slice(2, 10)}`,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
  };
}
