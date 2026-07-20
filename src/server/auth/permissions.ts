import "server-only";
import type { RoleKey } from "./claims";

/**
 * RBAC permission engine — PURE LOGIC (no I/O, no schema coupling).
 *
 * This module knows nothing about physical table/column names. It defines the permission
 * ladder, the evaluation rule, and the merge of the role baseline with employee-level
 * overrides. The DB loader (permissions.load.ts, added once the schema columns are confirmed)
 * fetches rows through the RBAC chain and hands typed rows to `mergePermissions` here.
 *
 * Chain (authoritative, seeded/verified in DB):
 *   app_user.id → employee.user_id → employee.position_id
 *   → position.default_role_id → role → role_module_permission → app_module
 * Employee override: employee_module_permission (effect allow/deny, optional branch scope).
 */

/** The permission ladder, lowest → highest privilege. */
export const PERMISSION_LEVELS = ["view", "create", "update", "approve", "export", "admin"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/** admin > export > approve > update > create > view */
const LEVEL_RANK: Record<PermissionLevel, number> = {
  view: 1,
  create: 2,
  update: 3,
  approve: 4,
  export: 5,
  admin: 6,
};

/** Numeric rank of a level (0 for unknown/absent). */
export function rankOf(level: PermissionLevel | null | undefined): number {
  return level ? (LEVEL_RANK[level] ?? 0) : 0;
}

/** True if `held` satisfies `required` (equal or higher privilege). */
export function meetsLevel(
  held: PermissionLevel | null | undefined,
  required: PermissionLevel,
): boolean {
  return rankOf(held) >= rankOf(required);
}

/** Employee-override effect. */
export type OverrideEffect = "allow" | "deny";

// ── Raw row shapes the loader produces from the DB (already normalised, no column names) ──

/** One active module in the catalog. */
export type ModuleRow = {
  moduleId: string;
  moduleKey: string;
  moduleLabel: string;
  parentId: string | null;
  sort: number;
  isActive: boolean;
};

/** A role→module grant (baseline for the user's role). */
export type RolePermRow = { moduleId: string; level: PermissionLevel };

/** An employee→module override; branchId null = global (all branches). */
export type OverrideRow = {
  moduleId: string;
  branchId: string | null;
  level: PermissionLevel;
  effect: OverrideEffect;
};

// ── Resolved output ──

/** An accessible module after merging baseline + overrides (only active, granted modules). */
export type ModulePermission = {
  moduleId: string;
  moduleKey: string;
  moduleLabel: string;
  parentId: string | null;
  sort: number;
  level: PermissionLevel;
};

/** The full resolved permission set for the logged-in user. */
export type UserPermissions = {
  employeeId: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  roleKey: RoleKey | string | null;
  positionKey: string | null;
  /** Owner short-circuits to full admin on every module (keeps owner working always). */
  isOwner: boolean;
  /** branchId this set was resolved for (null = global scope). */
  branchId: string | null;
  /** module_key → effective permission. Only ACTIVE + GRANTED modules are present. */
  modules: Map<string, ModulePermission>;
  /** All active modules in the catalog (granted or not) — needed to resolve ungranted ancestors. */
  catalog: ModuleRow[];
};

/**
 * Merge the role baseline with employee overrides for a given branch scope.
 *
 * Precedence (most specific wins): branch-specific override > global override > role baseline.
 * Within the winning source: effect 'deny' removes access; 'allow' grants at its level.
 * Inactive modules are dropped. Modules that resolve to no level are omitted entirely.
 */
export function mergePermissions(
  modules: readonly ModuleRow[],
  roleRows: readonly RolePermRow[],
  overrideRows: readonly OverrideRow[],
  branchId: string | null,
): Map<string, ModulePermission> {
  const baseline = new Map<string, PermissionLevel>();
  for (const r of roleRows) baseline.set(r.moduleId, r.level);

  const globalOv = new Map<string, OverrideRow>();
  const branchOv = new Map<string, OverrideRow>();
  for (const o of overrideRows) {
    if (o.branchId === null) globalOv.set(o.moduleId, o);
    else if (branchId !== null && o.branchId === branchId) branchOv.set(o.moduleId, o);
  }

  const out = new Map<string, ModulePermission>();
  for (const m of modules) {
    if (!m.isActive) continue;
    const ov = branchOv.get(m.moduleId) ?? globalOv.get(m.moduleId);
    const level: PermissionLevel | null = ov
      ? ov.effect === "deny"
        ? null
        : ov.level
      : (baseline.get(m.moduleId) ?? null);
    if (!level) continue;
    out.set(m.moduleKey, {
      moduleId: m.moduleId,
      moduleKey: m.moduleKey,
      moduleLabel: m.moduleLabel,
      parentId: m.parentId,
      sort: m.sort,
      level,
    });
  }
  return out;
}

// ── Evaluation used by the sidebar builder and the route guard ──

/** Effective level the user holds on a module (owner = admin on everything). */
export function moduleLevel(perms: UserPermissions, moduleKey: string): PermissionLevel | null {
  if (perms.isOwner) return "admin";
  return perms.modules.get(moduleKey)?.level ?? null;
}

/** Can the user access `moduleKey` at (at least) `required`? Owner always can. */
export function canAccess(
  perms: UserPermissions,
  moduleKey: string,
  required: PermissionLevel = "view",
): boolean {
  if (perms.isOwner) return true;
  return meetsLevel(perms.modules.get(moduleKey)?.level, required);
}

/**
 * The set of module_keys to show in navigation: every accessible module PLUS the ancestors of
 * accessible modules (so a parent appears when the user can see at least one of its children —
 * even if the parent itself carries no direct grant). Owner sees all active modules.
 */
export function visibleModuleKeys(perms: UserPermissions): Set<string> {
  const keys = new Set<string>();
  if (perms.isOwner) {
    for (const m of perms.catalog) if (m.isActive) keys.add(m.moduleKey);
    return keys;
  }
  const byId = new Map(perms.catalog.map((m) => [m.moduleId, m]));
  for (const granted of perms.modules.values()) {
    let cur: ModuleRow | undefined = byId.get(granted.moduleId);
    if (!cur) {
      keys.add(granted.moduleKey);
      continue;
    }
    const seen = new Set<string>();
    while (cur && !seen.has(cur.moduleId)) {
      keys.add(cur.moduleKey);
      seen.add(cur.moduleId);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return keys;
}
