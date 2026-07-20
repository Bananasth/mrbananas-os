import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthContext } from "./context";
import {
  mergePermissions,
  PERMISSION_LEVELS,
  type ModulePermission,
  type ModuleRow,
  type OverrideRow,
  type PermissionLevel,
  type RolePermRow,
  type UserPermissions,
} from "./permissions";

/**
 * RBAC permission LOADER — reads the confirmed chain UNDER RLS with the SSR (anon/publishable)
 * client. No service-role key, no schema changes, no writes.
 *
 *   app_user.id → employee.user_id → employee.position_id
 *   → position.default_role_id → role → role_module_permission → app_module
 *   + employee_module_permission overrides (effect allow/deny, optional branch scope)
 *
 * Fail-closed: any load error yields an empty permission set for non-owners; the owner is kept
 * fully working via the JWT short-circuit. Column names for the JOIN KEYS are confirmed; the
 * display/label/sort columns are read tolerantly (see `pick`) so a naming variance can't break
 * auth loading — adjust the candidate lists below if your schema uses different display columns.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

const asLevel = (v: unknown): PermissionLevel | null =>
  typeof v === "string" && (PERMISSION_LEVELS as readonly string[]).includes(v)
    ? (v as PermissionLevel)
    : null;

/** First non-null value among candidate column names (tolerant of display-column naming). */
const pick = (row: Row, keys: readonly string[]): unknown => {
  for (const k of keys) if (row[k] != null) return row[k];
  return null;
};

/** Exact snake_case row shape required by the task spec (one row per accessible module). */
export type PermissionRow = {
  employee_id: string | null;
  employee_code: string | null;
  employee_name: string | null;
  role_key: string | null;
  position_key: string | null;
  module_key: string;
  module_label: string;
  parent_id: string | null;
  permission_level: PermissionLevel;
  module_sort: number;
  is_active: boolean;
};

/**
 * Per-request memoised core. Keyed on PRIMITIVES (userId / primaryRole / branchId) — not the
 * AuthContext object — so repeat calls within a single render (e.g. the admin layout's nav build
 * plus a page's requireModule) resolve the chain ONCE instead of re-querying.
 */
const loadPermsCached = cache(
  async (
    userId: string,
    primaryRole: string,
    branchId: string | null,
  ): Promise<UserPermissions> => {
    const ownerByJwt = primaryRole === "owner";
  const base: UserPermissions = {
    employeeId: null,
    employeeCode: null,
    employeeName: null,
    roleKey: null,
    positionKey: null,
    isOwner: ownerByJwt,
    branchId,
    modules: new Map(),
    catalog: [],
  };

  const db = await createSupabaseServerClient();

  // 1) employee (by app_user id). One employee record per user for role resolution.
  const { data: empData } = await db
    .from("employee")
    .select("*")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!empData) return base; // no employee record — owner still safe via short-circuit
  const emp = empData as Row;
  const employeeId = str(pick(emp, ["id"]));
  const employeeCode = str(pick(emp, ["employee_code", "code", "emp_code"]));
  const employeeName = str(pick(emp, ["employee_name", "full_name", "name", "display_name"]));
  const positionId = str(pick(emp, ["position_id"]));

  // 2) position → default_role_id
  let positionKey: string | null = null;
  let roleId: string | null = null;
  if (positionId) {
    const { data: posData } = await db.from("position").select("*").eq("id", positionId).maybeSingle();
    if (posData) {
      const pos = posData as Row;
      positionKey = str(pick(pos, ["position_key", "key", "code"]));
      roleId = str(pick(pos, ["default_role_id"]));
    }
  }

  // 3) role → role_key
  let roleKey: string | null = null;
  if (roleId) {
    const { data: roleData } = await db.from("role").select("*").eq("id", roleId).maybeSingle();
    if (roleData) roleKey = str(pick(roleData as Row, ["role_key", "key", "code", "name"]));
  }

  const isOwner = ownerByJwt || roleKey === "owner";

  // 4) module catalog (RLS scopes to tenant)
  const { data: modData } = await db.from("app_module").select("*");
  const catalog: ModuleRow[] = (modData ?? [])
    .map((r) => {
      const m = r as Row;
      const moduleId = str(pick(m, ["id", "module_id"])) ?? "";
      const moduleKey = str(pick(m, ["module_key", "key"])) ?? moduleId;
      return {
        moduleId,
        moduleKey,
        moduleLabel: str(pick(m, ["module_label", "label", "name", "title"])) ?? moduleKey,
        parentId: str(pick(m, ["parent_id", "parent_module_id"])),
        sort: Number(pick(m, ["module_sort", "sort", "sort_order", "position"]) ?? 0) || 0,
        // active unless a boolean flag explicitly says false
        isActive: pick(m, ["is_active", "active", "enabled"]) !== false,
      } satisfies ModuleRow;
    })
    .filter((m) => m.moduleId.length > 0);

  // 5) role baseline grants
  let roleRows: RolePermRow[] = [];
  if (roleId) {
    const { data: rp } = await db
      .from("role_module_permission")
      .select("module_id, permission_level")
      .eq("role_id", roleId);
    roleRows = (rp ?? []).flatMap((r) => {
      const row = r as Row;
      const moduleId = str(row.module_id);
      const level = asLevel(row.permission_level);
      return moduleId && level ? [{ moduleId, level }] : [];
    });
  }

  // 6) employee overrides
  let overrideRows: OverrideRow[] = [];
  if (employeeId) {
    const { data: ov } = await db
      .from("employee_module_permission")
      .select("module_id, branch_id, permission_level, effect")
      .eq("employee_id", employeeId);
    overrideRows = (ov ?? []).flatMap((r) => {
      const row = r as Row;
      const moduleId = str(row.module_id);
      const effect = row.effect === "deny" ? "deny" : row.effect === "allow" ? "allow" : null;
      if (!moduleId || !effect) return [];
      const level = asLevel(row.permission_level);
      if (effect === "allow" && !level) return []; // an allow with no level grants nothing
      return [{ moduleId, branchId: str(row.branch_id), level: level ?? "view", effect }];
    });
  }

  // Owner: full admin on every active module. Otherwise merge baseline + overrides.
  const modules: Map<string, ModulePermission> = isOwner
    ? new Map(
        catalog
          .filter((m) => m.isActive)
          .map((m) => [
            m.moduleKey,
            {
              moduleId: m.moduleId,
              moduleKey: m.moduleKey,
              moduleLabel: m.moduleLabel,
              parentId: m.parentId,
              sort: m.sort,
              level: "admin" as PermissionLevel,
            },
          ]),
      )
    : mergePermissions(catalog, roleRows, overrideRows, branchId);

  return {
    employeeId,
    employeeCode,
    employeeName,
    roleKey,
    positionKey,
    isOwner,
    branchId,
    modules,
    catalog,
  };
  },
);

/** Load the logged-in user's resolved permissions for a branch scope (null = global). */
export async function loadUserPermissions(
  ctx: AuthContext,
  branchId: string | null = null,
): Promise<UserPermissions> {
  return loadPermsCached(ctx.userId, ctx.primaryRole, branchId);
}

/** Flatten resolved permissions into the exact required snake_case rows (sorted by module_sort). */
export function toPermissionRows(perms: UserPermissions): PermissionRow[] {
  return [...perms.modules.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((m) => ({
      employee_id: perms.employeeId,
      employee_code: perms.employeeCode,
      employee_name: perms.employeeName,
      role_key: typeof perms.roleKey === "string" ? perms.roleKey : null,
      position_key: perms.positionKey,
      module_key: m.moduleKey,
      module_label: m.moduleLabel,
      parent_id: m.parentId,
      permission_level: m.level,
      module_sort: m.sort,
      is_active: true, // the map only ever holds active, granted modules
    }));
}
