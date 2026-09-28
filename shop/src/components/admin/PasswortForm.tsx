"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { adminPasswortAendernAction, type AdminAuthState } from "@/app/actions/admin-auth";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Speichern …" : "Passwort ändern"}
    </button>
  );
}

export function PasswortForm({ email }: { email: string }) {
  const [state, action] = useActionState<AdminAuthState, FormData>(adminPasswortAendernAction, { ok: false });
  const formRef = useRef<HTMLFormElement>(null);

  // Nach Erfolg die Felder leeren – Passwörter sollen nicht stehen bleiben.
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div>
        <label htmlFor="pw-aktuell" className="label">Bisheriges Passwort</label>
        <input id="pw-aktuell" name="aktuell" type="password" required autoComplete="current-password" className="field" />
      </div>
      <div>
        <label htmlFor="pw-neu" className="label">Neues Passwort</label>
        <input id="pw-neu" name="neu" type="password" required minLength={12} autoComplete="new-password" className="field" />
        <p className="mt-1 text-sm text-mist-700">Mindestens 12 Zeichen. Am sichersten ist ein Passwortmanager.</p>
      </div>
      <div>
        <label htmlFor="pw-wiederholung" className="label">Neues Passwort wiederholen</label>
        <input id="pw-wiederholung" name="wiederholung" type="password" required minLength={12} autoComplete="new-password" className="field" />
      </div>
      {/* Für Passwortmanager: zu welchem Konto das neue Passwort gehört. */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <Submit />
      {state.message && (
        <p
          className={`text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-600"}`}
          role={state.ok ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
