"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  addOrderNoteAction,
  createLabelAction,
  refundOrderAction,
  resendShippingMailAction,
  updateOrderStatusAction,
  type AdminActionState,
} from "@/app/actions/admin-orders";
import { ORDER_STATUS } from "@/lib/order-status";
import { formatCents } from "@/lib/money";

type ShippingOption = { code: string; label: string; isConfigured: boolean };

function Submit({ label, variant = "dark" }: { label: string; variant?: "dark" | "primary" | "ghost" }) {
  const { pending } = useFormStatus();
  const className = variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "btn-dark";
  return (
    <button type="submit" className={`${className} w-full py-2.5 text-sm`} disabled={pending}>
      {pending ? "Wird ausgeführt …" : label}
    </button>
  );
}

function Result({ state }: { state: AdminActionState }) {
  if (!state.message) return null;
  return (
    <p className={`mt-2 text-sm ${state.ok ? "text-emerald-700" : "text-red-600"}`} role="status">
      {state.message}
    </p>
  );
}

/** Aktionsspalte der Bestelldetailseite: Status, Versandlabel, Erstattung, Notizen. */
export function OrderActions({
  orderId,
  orderNumber,
  status,
  paymentStatus,
  shippingMethod,
  refundableCents,
  shippingOptions,
  shipment,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  shippingMethod: string;
  refundableCents: number;
  shippingOptions: ShippingOption[];
  shipment: {
    trackingNumber: string | null;
    trackingUrl: string | null;
    carrier: string;
    hasLabel: boolean;
    labelId: string | null;
  } | null;
}) {
  const [statusState, statusAction] = useActionState<AdminActionState, FormData>(updateOrderStatusAction, { ok: false });
  const [labelState, labelAction] = useActionState<AdminActionState, FormData>(createLabelAction, { ok: false });
  const [mailState, mailAction] = useActionState<AdminActionState, FormData>(resendShippingMailAction, { ok: false });
  const [refundState, refundAction] = useActionState<AdminActionState, FormData>(refundOrderAction, { ok: false });
  const [noteState, noteAction] = useActionState<AdminActionState, FormData>(addOrderNoteAction, { ok: false });

  const paid = paymentStatus === "paid";

  return (
    <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
      {/* Versand */}
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Versand</h2>

        {shipment?.trackingNumber ? (
          <div className="mt-4 space-y-3">
            <div>
              <p className="label mb-1">Sendungsnummer</p>
              <p className="font-mono text-[15px]">{shipment.trackingNumber}</p>
              <p className="mt-0.5 text-sm text-mist-700">
                {shipment.carrier === "dhl_express" ? "DHL Express" : "DHL Paket"}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {shipment.hasLabel && (
                <a
                  href={`/api/admin/label?orderId=${orderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary w-full py-2.5 text-sm"
                >
                  Versandetikett öffnen (PDF)
                </a>
              )}
              {shipment.trackingUrl && (
                <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full py-2.5 text-sm">
                  Tracking anzeigen
                </a>
              )}
              <form action={mailAction}>
                <input type="hidden" name="orderId" value={orderId} />
                <Submit label="Versandbestätigung erneut senden" variant="ghost" />
              </form>
              <Result state={mailState} />
            </div>
          </div>
        ) : (
          <form action={labelAction} className="mt-4 space-y-3">
            <input type="hidden" name="orderId" value={orderId} />
            <div>
              <label htmlFor="carrier" className="label">Versandart</label>
              <select id="carrier" name="carrier" defaultValue={shippingMethod} className="field py-2.5">
                {shippingOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                    {option.isConfigured ? "" : " – Zugangsdaten fehlen"}
                  </option>
                ))}
              </select>
            </div>
            {!paid && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Das Etikett kann erst nach bestätigter Zahlung erzeugt werden.
              </p>
            )}
            <Submit label="Versandetikett erstellen" variant="primary" />
            <Result state={labelState} />
          </form>
        )}
      </section>

      {/* Status */}
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Status ändern</h2>
        <form action={statusAction} className="mt-4 space-y-3">
          <input type="hidden" name="orderId" value={orderId} />
          <div>
            <label htmlFor="status" className="label">Neuer Status</label>
            <select id="status" name="status" defaultValue={status} className="field py-2.5">
              {Object.entries(ORDER_STATUS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <Submit label="Status speichern" />
          <Result state={statusState} />
        </form>
      </section>

      {/* Erstattung */}
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Erstattung</h2>
        <p className="mt-1 text-sm text-mist-700">
          Noch erstattbar: <span className="font-semibold tabular">{formatCents(refundableCents)}</span>
        </p>
        <form action={refundAction} className="mt-4 space-y-3">
          <input type="hidden" name="orderId" value={orderId} />
          <div>
            <label htmlFor="amount" className="label">Betrag (€)</label>
            <input
              id="amount"
              name="amount"
              type="text"
              inputMode="decimal"
              placeholder={(refundableCents / 100).toFixed(2)}
              className="field py-2.5 tabular"
              disabled={!paid || refundableCents <= 0}
            />
          </div>
          <div>
            <label htmlFor="reason" className="label">Grund (optional)</label>
            <input id="reason" name="reason" className="field py-2.5" disabled={!paid || refundableCents <= 0} />
          </div>
          <Submit label="Erstattung über Stripe auslösen" variant="ghost" />
          <Result state={refundState} />
        </form>
      </section>

      {/* Notizen */}
      <section className="card p-6">
        <h2 className="font-display text-lg font-bold">Interne Notiz</h2>
        <form action={noteAction} className="mt-4 space-y-3">
          <input type="hidden" name="orderId" value={orderId} />
          <label htmlFor="note" className="sr-only">Notiz zu Bestellung {orderNumber}</label>
          <textarea id="note" name="note" rows={3} className="field" placeholder="Nur intern sichtbar …" />
          <Submit label="Notiz speichern" variant="ghost" />
          <Result state={noteState} />
        </form>
      </section>
    </aside>
  );
}
