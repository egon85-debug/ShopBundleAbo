"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "wl_consent";

type Consent = { analytics: boolean; marketing: boolean };

/**
 * Einwilligungsverwaltung. Technisch notwendige Cookies sind nicht abwählbar
 * (§ 25 Abs. 2 TDDDG); optionale Kategorien werden erst nach Zustimmung aktiv.
 * Die Auswahl liegt lokal im Browser.
 */
export function CookieSettings() {
  const [consent, setConsent] = useState<Consent>({ analytics: false, marketing: false });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setConsent(JSON.parse(stored) as Consent);
    } catch {
      // Speicherzugriff kann blockiert sein – Standard bleibt "abgelehnt".
    }
  }, []);

  function save(next: Consent) {
    setConsent(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignoriert */
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="mt-12 space-y-4">
      <div className="karte p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-subheading font-medium">Technisch notwendig</h2>
            <p className="mt-2 text-body-sm text-kohle">
              Warenkorb, Anmeldesitzung und Sicherheitsfunktionen. Ohne diese Cookies funktioniert der
              Shop nicht.
            </p>
          </div>
          <span className="plakette-leise shrink-0">Immer aktiv</span>
        </div>
      </div>

      {(
        [
          ["analytics", "Statistik", "Anonyme Reichweitenmessung zur Verbesserung des Shops."],
          ["marketing", "Marketing", "Personalisierte Werbung und Erfolgsmessung von Kampagnen."],
        ] as const
      ).map(([key, title, text]) => (
        <div key={key} className="karte p-6">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-subheading font-medium">{title}</span>
              <span className="mt-2 block text-body-sm text-kohle">{text}</span>
            </span>
            <input
              type="checkbox"
              checked={consent[key]}
              onChange={(event) => save({ ...consent, [key]: event.target.checked })}
              className="auswahl mt-1 h-6 w-6"
            />
          </label>
        </div>
      ))}

      {/* Bewusst zwei gleichrangige Knöpfe: Ablehnen darf nicht schwerer sein
          als Zustimmen – deshalb hier keine orange Hauptaktion. */}
      <div className="flex flex-wrap gap-3 pt-2">
        <button type="button" onClick={() => save({ analytics: true, marketing: true })} className="knopf-zweit">
          Alle akzeptieren
        </button>
        <button type="button" onClick={() => save({ analytics: false, marketing: false })} className="knopf-zweit">
          Nur notwendige
        </button>
      </div>

      {saved && (
        <p className="hinweis-ok" role="status">
          Einstellungen gespeichert.
        </p>
      )}
    </div>
  );
}
