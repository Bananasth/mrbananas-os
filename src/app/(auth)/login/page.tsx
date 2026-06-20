import type { Metadata } from "next";
import { site } from "@/site.config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ · Sign in", robots: { index: false } };

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-6 text-center">
        <div className="flex items-center justify-center gap-2 text-xl font-bold">
          <span aria-hidden>🍌</span>
          {site.name}
        </div>
        <p className="mt-1 text-sm text-muted">เข้าสู่ระบบเพื่อจัดการร้าน</p>
      </div>
      <LoginForm />
    </div>
  );
}
