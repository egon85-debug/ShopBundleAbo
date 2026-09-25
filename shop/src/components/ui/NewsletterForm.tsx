"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { subscribeNewsletterAction, type ActionState } from "@/app/actions/shop";

function SubmitButton() {
  const { pending } = useFormStatus();
  // Zweitknopf: die orange Hauptaktion der Startseite ist "Zum Shop".
  return (
    <button type="submit" className="knopf-zweit shrink-0" disabled={pending}>
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
          className="feld"
        />
        <SubmitButton />
      </div>
      {state.message && (
        <p className={`mt-3 ${state.ok ? "hinweis-ok" : "hinweis-fehler"}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
