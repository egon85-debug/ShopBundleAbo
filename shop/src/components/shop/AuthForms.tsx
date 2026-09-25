"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  customerLoginAction,
  customerRegisterAction,
  requestPasswordResetAction,
  type AuthState,
} from "@/app/actions/account";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf-aktion w-full" disabled={pending}>
      {pending ? "Bitte warten …" : label}
    </button>
  );
}

/** Login, Registrierung und Passwort-Reset in einer Karte – ohne Seitenwechsel. */
export function AuthForms() {
  const [tab, setTab] = useState<"login" | "register" | "reset">("login");
  const [loginState, loginAction] = useActionState<AuthState, FormData>(customerLoginAction, { ok: false });
  const [registerState, registerAction] = useActionState<AuthState, FormData>(customerRegisterAction, { ok: false });
  const [resetState, resetAction] = useActionState<AuthState, FormData>(requestPasswordResetAction, { ok: false });

  const state = tab === "login" ? loginState : tab === "register" ? registerState : resetState;

  return (
    <div className="karte mx-auto max-w-md p-8">
      <div className="mb-8 flex gap-6 border-b border-haarlinie" role="tablist">
        {(
          [
            ["login", "Anmelden"],
            ["register", "Registrieren"],
            ["reset", "Passwort"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`-mb-px pb-3 text-body transition-colors ${
              tab === value ? "border-b-2 border-akzent font-medium text-tinte" : "text-kohle hover:text-tinte"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "login" && (
        <form action={loginAction} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="feldname">E-Mail</label>
            <input id="login-email" name="email" type="email" required autoComplete="email" className="feld" />
          </div>
          <div>
            <label htmlFor="login-password" className="feldname">Passwort</label>
            <input id="login-password" name="password" type="password" required autoComplete="current-password" className="feld" />
          </div>
          <Submit label="Anmelden" />
        </form>
      )}

      {tab === "register" && (
        <form action={registerAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reg-firstName" className="feldname">Vorname</label>
              <input id="reg-firstName" name="firstName" required className="feld" />
            </div>
            <div>
              <label htmlFor="reg-lastName" className="feldname">Nachname</label>
              <input id="reg-lastName" name="lastName" required className="feld" />
            </div>
          </div>
          <div>
            <label htmlFor="reg-email" className="feldname">E-Mail</label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" className="feld" />
          </div>
          <div>
            <label htmlFor="reg-password" className="feldname">Passwort (min. 10 Zeichen)</label>
            <input id="reg-password" name="password" type="password" minLength={10} required autoComplete="new-password" className="feld" />
          </div>
          <Submit label="Konto erstellen" />
        </form>
      )}

      {tab === "reset" && (
        <form action={resetAction} className="space-y-4">
          <p className="text-body-sm text-kohle">
            Wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
          </p>
          <div>
            <label htmlFor="reset-email" className="feldname">E-Mail</label>
            <input id="reset-email" name="email" type="email" required className="feld" />
          </div>
          <Submit label="Link anfordern" />
        </form>
      )}

      {state.message && (
        <p className={`mt-4 ${state.ok ? "hinweis-ok" : "hinweis-fehler"}`} role="status">
          {state.message}
        </p>
      )}
    </div>
  );
}
