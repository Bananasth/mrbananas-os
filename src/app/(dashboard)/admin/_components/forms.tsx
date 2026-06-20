"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** Shared input/select styling matching the site tokens. */
export const fieldClass =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/30";

export function SubmitButton({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-fg transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "กำลังบันทึก…" : children}
    </button>
  );
}

export function FormMessage({ ok, error }: { ok?: boolean; error?: string }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (ok) return <p className="text-sm text-green-700">บันทึกแล้ว · Saved</p>;
  return null;
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
