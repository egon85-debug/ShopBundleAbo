"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { adminUsers } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import {
  createSession,
  destroyAllSessions,
  destroySession,
  hashPassword,
  requireAdmin,
  verifyPassword,
} from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { loginSchema, passwortAendernSchema } from "@/lib/validation";

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

/**
 * Eigenes Passwort ändern. Danach sind alle anderen Sitzungen dieses Kontos
 * beendet (andere Geräte müssen sich neu anmelden); die eigene bleibt offen.
 */
export async function adminPasswortAendernAction(
  _prev: AdminAuthState,
  formData: FormData,
): Promise<AdminAuthState> {
  const admin = await requireAdmin();
  const ip = clientIp(await headers());
  if (!rateLimit(`admin-passwort:${admin.id}`, 5)) {
    return { ok: false, message: "Zu viele Versuche. Bitte kurz warten." };
  }

  const parsed = passwortAendernSchema.safeParse({
    aktuell: String(formData.get("aktuell") ?? ""),
    neu: String(formData.get("neu") ?? ""),
    wiederholung: String(formData.get("wiederholung") ?? ""),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  }
  if (!(await verifyPassword(parsed.data.aktuell, admin.passwordHash))) {
    await logAudit({
      adminUserId: admin.id,
      adminName: admin.name,
      entityType: "admin_auth",
      entityId: admin.id,
      action: "password_change_failed",
      ipAddress: ip,
    });
    return { ok: false, message: "Das bisherige Passwort ist falsch." };
  }

  await db
    .update(adminUsers)
    .set({ passwordHash: await hashPassword(parsed.data.neu) })
    .where(eq(adminUsers.id, admin.id));
  await destroyAllSessions("admin", admin.id);
  await createSession("admin", admin.id);
  await logAudit({
    adminUserId: admin.id,
    adminName: admin.name,
    entityType: "admin_auth",
    entityId: admin.id,
    action: "password_change",
    ipAddress: ip,
  });

  return { ok: true, message: "Passwort geändert. Andere Geräte wurden abgemeldet." };
}
