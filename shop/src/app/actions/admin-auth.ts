"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";

export type AdminAuthState = { ok: boolean; message?: string };

export async function adminLoginAction(_prev: AdminAuthState, formData: FormData): Promise<AdminAuthState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`admin-login:${ip}`, 8)) {
    return { ok: false, message: "Zu viele Anmeldeversuche. Bitte kurz warten." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, message: "Bitte E-Mail und Passwort angeben." };

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, parsed.data.email.toLowerCase()))
    .limit(1);

  if (!admin || !admin.isActive || !(await verifyPassword(parsed.data.password, admin.passwordHash))) {
    await logAudit({
      entityType: "admin_auth",
      entityId: parsed.data.email.toLowerCase(),
      action: "login_failed",
      ipAddress: ip,
    });
    return { ok: false, message: "E-Mail oder Passwort ist falsch." };
  }

  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, admin.id));
  await createSession("admin", admin.id);
  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "admin_auth",
    entityId: admin.id,
    action: "login",
    ipAddress: ip,
  });

  redirect("/admin");
}

export async function adminLogoutAction(): Promise<void> {
  await destroySession("admin");
  redirect("/admin/login");
}
