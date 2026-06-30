import { moduleByKey, type NavLeaf } from "./nav-config";

/**
 * Shared "coming soon" shell for modules whose logic isn't built yet. Renders the
 * module title and the planned submodules (read from nav-config, the single source
 * of truth). No business logic — purely navigational scaffolding.
 */
export function ModulePlaceholder({ moduleKey }: { moduleKey: string }) {
  const mod = moduleByKey(moduleKey);
  if (!mod) return null;

  const subs: NavLeaf[] = (mod.items ?? []).flatMap((i) => [i, ...(i.children ?? [])]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <span aria-hidden>{mod.icon}</span>
          {mod.label} <span className="text-base font-normal text-muted">{mod.en}</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          อยู่ระหว่างพัฒนา · This module is planned — navigation is in place, functionality is coming soon.
        </p>
      </div>

      {subs.length ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted">โมดูลย่อยที่วางแผนไว้ · Planned submodules</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {subs.map((s) => (
              <li
                key={s.en}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <span className="text-sm">
                  {s.label} <span className="text-xs text-muted">{s.en}</span>
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    s.status === "ready" ? "bg-accent/20 text-fg" : "bg-bg text-muted"
                  }`}
                >
                  {s.status === "ready" ? "พร้อม · Ready" : "เร็ว ๆ นี้ · Soon"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
