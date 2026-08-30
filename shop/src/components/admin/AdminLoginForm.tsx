"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { adminLoginAction, type AdminAuthState } from "@/app/actions/admin-auth";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Anmelden …" : "Anmelden"}
    </button>
  );
}

export function AdminLoginForm() {
  const [state, action] = useActionState<AdminAuthState, FormData>(adminLoginAction, { ok: false });

  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="admin-email" className="label">E-Mail</label>
        <input id="admin-email" name="email" type="email" required autoComplete="username" className="field" />
      </div>
      <div>
        <label htmlFor="admin-password" className="label">Passwort</label>
        <input id="admin-password" name="password" type="password" required autoComplete="current-password" className="field" />
      </div>
      <Submit />
      {state.message && (
        <p className="text-sm font-semibold text-red-600" role="alert">{state.message}</p>
      )}
    </form>
  );
}
