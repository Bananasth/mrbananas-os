"use server";

import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "./context";
import { defaultRouteForRole } from "./routing";

type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "กรอกอีเมลและรหัสผ่าน · Enter email and password" };
  }
  if (!hasSupabaseEnv) {
    return { error: "ระบบยังไม่ได้ตั้งค่า · Supabase is not configured (set .env.local)" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง · Invalid email or password" };
  }

  const ctx = await getAuthContext();
  redirect(ctx ? defaultRouteForRole(ctx.primaryRole) : "/no-access");
}

export async function logout(): Promise<void> {
  if (hasSupabaseEnv) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
