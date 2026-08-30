/**
 * Zugriff auf Environment-Variablen – ausschließlich serverseitig.
 * Fehlende Zugangsdaten führen zu einer klaren Fehlermeldung statt zu stillem Fehlverhalten.
 */
import "server-only";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Umgebungsvariable ${name} fehlt. Bitte in shop/.env eintragen (Vorlage: shop/.env.example).`,
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function isConfigured(...names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]));
}

export const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
