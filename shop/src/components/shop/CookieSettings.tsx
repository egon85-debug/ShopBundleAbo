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
    <div className="mt-10 space-y-4">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold">Technisch notwendig</h2>
            <p className="mt-1.5 text-[15px] text-mist-700">
              Warenkorb, Anmeldesitzung und Sicherheitsfunktionen. Ohne diese Cookies funktioniert der
              Shop nicht.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-3 py-1 font-display text-xs font-bold text-emerald-700">
            Immer aktiv
          </span>
        </div>
      </div>

      {(
        [
          ["analytics", "Statistik", "Anonyme Reichweitenmessung zur Verbesserung des Shops."],
          ["marketing", "Marketing", "Personalisierte Werbung und Erfolgsmessung von Kampagnen."],
        ] as const
      ).map(([key, title, text]) => (
        <div key={key} className="card p-6">
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block font-display text-lg font-bold">{title}</span>
              <span className="mt-1.5 block text-[15px] text-mist-700">{text}</span>
            </span>
            <input
              type="checkbox"
              checked={consent[key]}
              onChange={(event) => save({ ...consent, [key]: event.target.checked })}
              className="mt-1 h-6 w-6 shrink-0 rounded border-mist-300 text-signal-500 focus:ring-signal-500"
            />
          </label>
        </div>
      ))}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => save({ analytics: true, marketing: true })} className="btn-primary">
          Alle akzeptieren
        </button>
        <button type="button" onClick={() => save({ analytics: false, marketing: false })} className="btn-ghost">
          Nur notwendige
        </button>
      </div>

      {saved && (
        <p className="text-sm font-semibold text-emerald-600" role="status">
          Einstellungen gespeichert.
        </p>
      )}
    </div>
  );
}
