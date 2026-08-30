import "server-only";

import nodemailer from "nodemailer";

/**
 * E-Mail-Versand über SMTP. Ist kein SMTP konfiguriert, wird die Nachricht
 * protokolliert statt verworfen – der Bestellprozess darf daran nie scheitern.
 */
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn(
      `[E-Mail] SMTP nicht konfiguriert – "${params.subject}" an ${params.to} wurde nicht versendet. ` +
        `SMTP_HOST in shop/.env hinterlegen, um den Versand zu aktivieren.`,
    );
    return false;
  }
  try {
    await mailer.sendMail({
      from: process.env.SMTP_FROM ?? "Winterfeld Logistik <shop@example.de>",
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return true;
  } catch (error) {
    // Ein E-Mail-Fehler darf niemals eine Bestellung oder Zahlung scheitern lassen.
    console.error(`[E-Mail] Versand an ${params.to} fehlgeschlagen:`, error);
    return false;
  }
}
