"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { subscribeNewsletterAction, type ActionState } from "@/app/actions/shop";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary shrink-0" disabled={pending}>
      {pending ? "Wird gesendet …" : "Anmelden"}
    </button>
  );
}

export function NewsletterForm() {
  const [state, action] = useActionState<ActionState, FormData>(subscribeNewsletterAction, { ok: false });

  return (
    <form action={action} className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="newsletter-email" className="sr-only">
          E-Mail-Adresse
        </label>
        <input
          id="newsletter-email"
          type="email"
          name="email"
          required
          placeholder="ihre@email.de"
          className="field border-white/15 bg-white/10 text-white placeholder:text-mist-500"
        />
        <SubmitButton />
      </div>
      {state.message && (
        <p className={`mt-3 text-sm ${state.ok ? "text-emerald-400" : "text-beacon-400"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
