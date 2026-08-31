/**
 * Ordnet Datenbankfehler einer groben Ursache zu.
 *
 * Die Rueckgabe ist bewusst frei von Fehlermeldungen, Hostnamen und
 * Zugangsdaten – sie wird ueber einen oeffentlichen Endpunkt ausgeliefert.
 */
export type Ursache =
  | "ok"
  | "keine_konfiguration"
  | "anmeldung_abgelehnt"
  | "nicht_erreichbar"
  | "schema_fehlt"
  | "unbekannt";

export function kategorisiereFehler(fehler: unknown): { ursache: Ursache; hinweis: string } {
  const nachricht = fehler instanceof Error ? fehler.message : String(fehler);
  const code = (fehler as { code?: string })?.code ?? "";
  const beides = `${code} ${nachricht}`;

  if (/DATABASE_URL ist nicht gesetzt/i.test(nachricht)) {
    return {
      ursache: "keine_konfiguration",
      hinweis: "DATABASE_URL ist in dieser Umgebung nicht hinterlegt.",
    };
  }
  if (code === "28P01" || /password authentication failed|Wrong password|SASL/i.test(beides)) {
    return {
      ursache: "anmeldung_abgelehnt",
      hinweis: "Benutzername oder Passwort der Datenbank werden abgelehnt.",
    };
  }
  if (code === "42501" || /permission denied/i.test(beides)) {
    return {
      ursache: "anmeldung_abgelehnt",
      hinweis: "Die Datenbankrolle hat keine Rechte auf den Shop-Tabellen.",
    };
  }
  if (code === "42P01" || /relation .* does not exist/i.test(beides)) {
    return {
      ursache: "schema_fehlt",
      hinweis: "Die Verbindung steht, aber die Tabellen fehlen – Migrationen einspielen.",
    };
  }
  if (
    code === "3D000" ||
    /database .* does not exist/i.test(beides) ||
    /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT|ENETUNREACH|EHOSTUNREACH/i.test(beides)
  ) {
    return {
      ursache: "nicht_erreichbar",
      hinweis: "Der Datenbankserver ist unter der konfigurierten Adresse nicht erreichbar.",
    };
  }
  return { ursache: "unbekannt", hinweis: "Unerwarteter Datenbankfehler." };
}
