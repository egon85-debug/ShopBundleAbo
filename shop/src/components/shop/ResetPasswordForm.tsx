"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resetPasswordAction, type AuthState } from "@/app/actions/account";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf-aktion w-full" disabled={pending}>
      {pending ? "Wird gespeichert …" : "Passwort speichern"}
    </button>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<AuthState, FormData>(resetPasswordAction, { ok: false });

  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="new-password" className="feldname">Neues Passwort (min. 10 Zeichen)</label>
        <input id="new-password" name="password" type="password" minLength={10} required autoComplete="new-password" className="feld" />
      </div>
      <Submit />
      {state.message && (
        <p className={state.ok ? "hinweis-ok" : "hinweis-fehler"} role="status">
          {state.message}{" "}
          {state.ok && (
            <Link href="/konto" className="font-medium underline underline-offset-4">Zur Anmeldung</Link>
          )}
        </p>
      )}
    </form>
  );
}
