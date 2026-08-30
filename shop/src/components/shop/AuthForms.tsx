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
    <button type="submit" className="btn-primary w-full" disabled={pending}>
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
    <div className="card mx-auto max-w-md p-7">
      <div className="mb-6 flex gap-1 rounded-xl bg-mist-100 p-1" role="tablist">
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
            className={`flex-1 rounded-lg px-3 py-2 font-display text-sm font-bold transition-colors ${
              tab === value ? "bg-white shadow-sm" : "text-mist-700 hover:text-carbon-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "login" && (
        <form action={loginAction} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="label">E-Mail</label>
            <input id="login-email" name="email" type="email" required autoComplete="email" className="field" />
          </div>
          <div>
            <label htmlFor="login-password" className="label">Passwort</label>
            <input id="login-password" name="password" type="password" required autoComplete="current-password" className="field" />
          </div>
          <Submit label="Anmelden" />
        </form>
      )}

      {tab === "register" && (
        <form action={registerAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="reg-firstName" className="label">Vorname</label>
              <input id="reg-firstName" name="firstName" required className="field" />
            </div>
            <div>
              <label htmlFor="reg-lastName" className="label">Nachname</label>
              <input id="reg-lastName" name="lastName" required className="field" />
            </div>
          </div>
          <div>
            <label htmlFor="reg-email" className="label">E-Mail</label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" className="field" />
          </div>
          <div>
            <label htmlFor="reg-password" className="label">Passwort (min. 10 Zeichen)</label>
            <input id="reg-password" name="password" type="password" minLength={10} required autoComplete="new-password" className="field" />
          </div>
          <Submit label="Konto erstellen" />
        </form>
      )}

      {tab === "reset" && (
        <form action={resetAction} className="space-y-4">
          <p className="text-sm text-mist-700">
            Wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
          </p>
          <div>
            <label htmlFor="reset-email" className="label">E-Mail</label>
            <input id="reset-email" name="email" type="email" required className="field" />
          </div>
          <Submit label="Link anfordern" />
        </form>
      )}

      {state.message && (
        <p className={`mt-4 text-sm ${state.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
          {state.message}
        </p>
      )}
    </div>
  );
}
