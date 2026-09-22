"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser, LoginCredentials, SignUpInput } from "@/types/auth";
import {
  getBackendUser,
  getDemoUser,
  login as loginRequest,
  logout as logoutRequest,
  signUp as signUpRequest,
} from "@/services/authService";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isPending: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Placeholder authentication context. There is no real backend yet, so the
 * app starts pre-authenticated as the dealership's default user — every
 * existing page keeps working unchanged. The seam (login/logout, the
 * AuthUser shape, the /login route) is real: swapping in a real identity
 * provider means editing services/authService.ts, not any component that reads
 * useAuth().
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getDemoUser);
  const [isPending, setIsPending] = useState(false);

  // When a real session exists (server cookie), show that person instead of the demo user. No session: demo user stays.
  useEffect(() => {
    let cancelled = false;
    getBackendUser().then((real) => {
      if (real && !cancelled) setUser(real);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsPending(true);
    try {
      const session = await loginRequest(credentials);
      setUser(session.user);
    } finally {
      setIsPending(false);
    }
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    setIsPending(true);
    try {
      const session = await signUpRequest(input);
      setUser(session.user);
    } finally {
      setIsPending(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsPending(true);
    try {
      await logoutRequest();
      setUser(null);
    } finally {
      setIsPending(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: user !== null, isPending, login, signUp, logout }),
    [user, isPending, login, signUp, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
