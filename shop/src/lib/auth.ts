/**
 * Sessions für Adminbereich und Kundenkonto.
 *
 * - Passwörter: bcrypt (Cost 12).
 * - Session-Token: 32 zufällige Bytes; im Cookie liegt das Klartext-Token,
 *   in der Datenbank nur dessen SHA-256-Hash (DB-Leak allein reicht nicht).
 * - Cookies: httpOnly, sameSite=lax, secure in Produktion.
 */
import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { adminUsers, customers, sessions } from "@/db/schema";

const ADMIN_COOKIE = "wl_admin_session";
const CUSTOMER_COOKIE = "wl_customer_session";
const SESSION_DAYS = 7;

export type SubjectType = "admin" | "customer";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Konstantzeit-Vergleich für CSRF-Token o. Ä. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function createSession(subjectType: SubjectType, subjectId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    subjectType,
    subjectId,
    expiresAt,
  });

  const store = await cookies();
  store.set(subjectType === "admin" ? ADMIN_COOKIE : CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

async function readSession(subjectType: SubjectType): Promise<string | null> {
  const store = await cookies();
  const token = store.get(subjectType === "admin" ? ADMIN_COOKIE : CUSTOMER_COOKIE)?.value;
  if (!token) return null;

  const [session] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        eq(sessions.subjectType, subjectType),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return session?.subjectId ?? null;
}

export async function destroySession(subjectType: SubjectType): Promise<void> {
  const store = await cookies();
  const cookieName = subjectType === "admin" ? ADMIN_COOKIE : CUSTOMER_COOKIE;
  const token = store.get(cookieName)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(cookieName);
}

export type AdminUser = typeof adminUsers.$inferSelect;
export type Customer = typeof customers.$inferSelect;

/** Aktuell angemeldeter Admin – oder null. */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const subjectId = await readSession("admin");
  if (!subjectId) return null;
  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.id, subjectId)).limit(1);
  return admin?.isActive ? admin : null;
}

/** Wirft, wenn kein Admin angemeldet ist – für Server Actions und Route Handler. */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("UNAUTHORIZED");
  return admin;
}

/** Nur die Rolle "owner" darf Adminbenutzer verwalten. */
export async function requireOwner(): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (admin.role !== "owner") throw new Error("FORBIDDEN");
  return admin;
}

export async function getCurrentCustomer(): Promise<Customer | null> {
  const subjectId = await readSession("customer");
  if (!subjectId) return null;
  const [customer] = await db.select().from(customers).where(eq(customers.id, subjectId)).limit(1);
  return customer?.isActive ? customer : null;
}

/** Einmal-Token für Passwort-Reset: Klartext für die E-Mail, Hash für die DB. */
export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export { hashToken };
