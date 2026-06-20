import type { RoleKey } from "./claims";

/**
 * The landing route for a role after login (and the redirect target for role mismatches).
 *
 * This app only exposes an admin dashboard, so only owner/manager have a surface here;
 * staff/baker/customer are sent to /no-access. (The POS/KDS surfaces live in the OS app.)
 */
export function defaultRouteForRole(role: RoleKey): string {
  switch (role) {
    case "owner":
    case "manager":
      return "/dashboard";
    case "staff":
    case "baker":
    case "customer":
      return "/no-access";
  }
}

const ROLE_PRECEDENCE: readonly RoleKey[] = ["owner", "manager", "staff", "baker", "customer"];

/** The highest-privilege role a user holds, used to pick their default surface. */
export function primaryRole(roles: readonly RoleKey[]): RoleKey {
  for (const role of ROLE_PRECEDENCE) {
    if (roles.includes(role)) return role;
  }
  return "customer";
}
