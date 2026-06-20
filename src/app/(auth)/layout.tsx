import type { ReactNode } from "react";

/** Minimal centered shell for auth screens — no marketing chrome. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">{children}</div>
  );
}
