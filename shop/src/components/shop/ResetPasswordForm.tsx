"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resetPasswordAction, type AuthState } from "@/app/actions/account";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
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
        <label htmlFor="new-password" className="label">Neues Passwort (min. 10 Zeichen)</label>
        <input id="new-password" name="password" type="password" minLength={10} required autoComplete="new-password" className="field" />
      </div>
      <Submit />
      {state.message && (
        <p className={`text-sm ${state.ok ? "text-emerald-600" : "text-red-600"}`} role="status">
          {state.message}{" "}
          {state.ok && (
            <Link href="/konto" className="font-semibold underline">Zur Anmeldung</Link>
          )}
        </p>
      )}
    </form>
  );
}
