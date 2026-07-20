import "server-only";
import { redirect } from "next/navigation";
import type { RoleKey } from "./claims";
import { type AuthContext, getAuthContext } from "./context";
import { canAccess, type PermissionLevel } from "./permissions";
import { loadUserPermissions } from "./permissions.load";
import { defaultRouteForRole } from "./routing";

/** Require an authenticated, provisioned, non-revoked session — else redirect to login. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Require the user to hold one of the given roles at any branch — else send them to their home. */
export async function requireRole(roles: readonly RoleKey[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  const allowed = ctx.branchRoles.some((br) => roles.includes(br.role));
  if (!allowed) redirect(defaultRouteForRole(ctx.primaryRole));
  return ctx;
}

/**
 * Require RBAC-module access at (at least) `level`. Loads the user's permissions from the real
 * chain and sends the user to the terminal /no-access page on denial (no redirect loop). Owner
 * always passes. Use this as the page/module-level authority — the hidden menu is cosmetic only.
 */
export async function requireModule(
  moduleKey: string,
  level: PermissionLevel = "view",
  branchId: string | null = null,
): Promise<AuthContext> {
  const ctx = await requireAuth();
  // Owner fast-path: full access, and we skip the permission loader entirely (no DB round-trips,
  // and no dependency on the RBAC chain for the owner — matches canAccess()'s owner short-circuit).
  if (ctx.primaryRole === "owner") return ctx;
  const perms = await loadUserPermissions(ctx, branchId);
  if (!canAccess(perms, moduleKey, level)) redirect("/no-access");
  return ctx;
}
