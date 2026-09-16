import type { ID } from "./common";
import type { RoleKey } from "@/lib/settings-roles";

export interface AuthUser {
  id: ID;
  name: string;
  email: string;
  avatarUrl?: string;
  role: RoleKey;
}

export interface AuthSession {
  user: AuthUser;
  token: string;
  expiresAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
