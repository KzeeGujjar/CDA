import type { AuthContext } from "@/server/auth/context";
import { requirePermission } from "@/server/auth/authorize";
import { withTenant } from "@/server/db/tenant";
import { notFound } from "@/server/lib/errors";

/** Compatible with the frontend `DealershipUser`, plus fields the Users screen will need. */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  roleName: string;
  status: string;
  avatar: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

// Explicit allow-list: password_hash, lockout state and tokens never leave the server.
const userSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  avatar: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { key: true, name: true } },
} as const;

type UserRow = {
  id: string;
  name: string;
  email: string;
  status: string;
  avatar: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: { key: string; name: string };
};

function toUserDto(u: UserRow): UserDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.key,
    roleName: u.role.name,
    status: u.status.toLowerCase(),
    avatar: u.avatar,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function listUsers(ctx: AuthContext): Promise<UserDto[]> {
  requirePermission(ctx, "users", "read");
  const rows = await withTenant(ctx, (db) =>
    db.user.findMany({ where: { deletedAt: null }, select: userSelect, orderBy: { name: "asc" } })
  );
  return rows.map(toUserDto);
}

export async function getUser(ctx: AuthContext, id: string): Promise<UserDto> {
  requirePermission(ctx, "users", "read");
  const row = await withTenant(ctx, (db) => db.user.findFirst({ where: { id, deletedAt: null }, select: userSelect }));
  if (!row) throw notFound("User not found.");
  return toUserDto(row);
}
