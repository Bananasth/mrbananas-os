import type { RoleKey } from "./claims";

/**
 * The landing route for a role after login (and the redirect target for role mismatches).
 *
 * owner/manager -> back-office dashboard, staff -> POS, baker -> the station board (the bar
 * layout already admits "baker", so this only stops sending them to a dead end). customer has no
 * internal surface, so they land on /no-access.
 */
export function defaultRouteForRole(role: RoleKey): string {
  switch (role) {
    case "owner":
    case "manager":
      return "/dashboard";
    case "staff":
      return "/pos";
    case "baker":
      return "/bar";
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
