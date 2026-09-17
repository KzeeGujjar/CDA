import type { ApiError } from "@/types/common";
import type { AuthSession, LoginCredentials, SignUpInput } from "@/types/auth";
import { currentUserFixture } from "@/mock/auth";

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Placeholder auth service. A real backend integration replaces the bodies
 * of these three functions with actual API calls — every call site (the
 * AuthProvider, the login page) is already written against this contract.
 */
export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  await wait();
  if (!credentials.email.trim() || !credentials.password.trim()) {
    const error: ApiError = { message: "Email and password are required.", code: "invalid_credentials", status: 400 };
    throw error;
  }
  return {
    user: { ...currentUserFixture, email: credentials.email },
    token: `mock-token-${Math.random().toString(36).slice(2, 10)}`,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
  };
}

export async function logout(): Promise<void> {
  await wait(150);
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
