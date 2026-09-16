import type { ApiError } from "@/types/common";
import type { AuthSession, LoginCredentials } from "@/types/auth";
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
