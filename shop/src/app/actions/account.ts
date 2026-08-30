"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { customers, passwordResetTokens } from "@/db/schema";
import {
  createResetToken,
  createSession,
  destroySession,
  getCurrentCustomer,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/auth";
import { sendMail } from "@/lib/email/send";
import { passwordResetMail } from "@/lib/email/templates";
import { siteUrl } from "@/lib/env";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { loginSchema, registerSchema } from "@/lib/validation";

export type AuthState = { ok: boolean; message?: string };

export async function customerLoginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 10)) {
    return { ok: false, message: "Zu viele Anmeldeversuche. Bitte kurz warten." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, message: "Bitte E-Mail und Passwort angeben." };

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.email, parsed.data.email.toLowerCase()))
    .limit(1);

  // Gleiche Meldung für falsche E-Mail und falsches Passwort (keine Konto-Aufzählung).
  if (!customer?.passwordHash || !customer.isActive) {
    return { ok: false, message: "E-Mail oder Passwort ist falsch." };
  }
  if (!(await verifyPassword(parsed.data.password, customer.passwordHash))) {
    return { ok: false, message: "E-Mail oder Passwort ist falsch." };
  }

  await createSession("customer", customer.id);
  redirect("/konto");
}

export async function customerRegisterAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`register:${ip}`, 5)) {
    return { ok: false, message: "Zu viele Versuche. Bitte kurz warten." };
  }

  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Bitte Eingaben prüfen." };
  }

  const email = parsed.data.email.toLowerCase();
  const [existing] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  if (existing) return { ok: false, message: "Für diese E-Mail existiert bereits ein Konto." };

  const [customer] = await db
    .insert(customers)
    .values({
      email,
      passwordHash: await hashPassword(parsed.data.password),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
    })
    .returning();

  await createSession("customer", customer.id);
  redirect("/konto");
}

export async function customerLogoutAction(): Promise<void> {
  await destroySession("customer");
  redirect("/");
}

export async function requestPasswordResetAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`reset:${ip}`, 5)) {
    return { ok: false, message: "Zu viele Anfragen. Bitte kurz warten." };
  }

  const email = String(formData.get("email") ?? "").toLowerCase();
  const [customer] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);

  // Antwort ist immer gleich – verrät nicht, ob ein Konto existiert.
  if (customer) {
    const { token, tokenHash } = createResetToken();
    await db.insert(passwordResetTokens).values({
      customerId: customer.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const mail = passwordResetMail({
      name: customer.firstName ?? "Kundin/Kunde",
      resetUrl: `${siteUrl()}/konto/passwort-neu?token=${token}`,
    });
    await sendMail({ to: customer.email, subject: mail.subject, html: mail.html });
  }

  return {
    ok: true,
    message: "Falls ein Konto existiert, haben wir eine E-Mail mit dem Link zum Zurücksetzen versendet.",
  };
}

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 10) return { ok: false, message: "Passwort braucht mindestens 10 Zeichen." };

  const [entry] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, hashToken(token)),
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .limit(1);

  if (!entry) return { ok: false, message: "Der Link ist ungültig oder abgelaufen." };

  await db
    .update(customers)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(customers.id, entry.customerId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, entry.id));

  return { ok: true, message: "Passwort geändert. Sie können sich jetzt anmelden." };
}

export async function updateProfileAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const customer = await getCurrentCustomer();
  if (!customer) return { ok: false, message: "Bitte melden Sie sich an." };

  await db
    .update(customers)
    .set({
      firstName: String(formData.get("firstName") ?? customer.firstName ?? ""),
      lastName: String(formData.get("lastName") ?? customer.lastName ?? ""),
      phone: String(formData.get("phone") ?? "") || null,
    })
    .where(eq(customers.id, customer.id));

  return { ok: true, message: "Ihre Daten wurden gespeichert." };
}
