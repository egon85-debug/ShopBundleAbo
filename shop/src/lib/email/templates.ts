/**
 * Transaktionale E-Mails im Winterfeld-Design (Punkt 12).
 * Reines HTML mit Inline-Styles – so rendern sie in allen gängigen Clients.
 */
import { formatCents } from "../money";

export type MailAddress = { name: string; email: string };

export interface OrderMailData {
  orderNumber: string;
  customerName: string;
  items: { name: string; variantName?: string | null; quantity: number; totalCents: number }[];
  subtotalCents: number;
  /** Pfand (0 = keine Zeile). */
  depositCents?: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingMethodLabel: string;
  orderUrl: string;
  trackingNumber?: string;
  trackingUrl?: string;
  refundAmountCents?: number;
  reason?: string;
}

const BRAND = "#0B5FFF";
const INK = "#141B24";
const MUTED = "#5B6B7B";
const LINE = "#E2E8F0";

function layout(title: string, preheader: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#F4F6F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
<span style="display:none;font-size:0;line-height:0;max-height:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F8;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid ${LINE};">
    <tr><td style="padding:26px 32px;border-bottom:3px solid ${BRAND};">
      <span style="font-size:18px;font-weight:800;letter-spacing:.12em;color:${INK};">WINTERFELD LOGISTIK</span><br>
      <span style="font-size:12px;color:${MUTED};letter-spacing:.06em;">LOGISTIK. EINFACH. DIGITAL.</span>
    </td></tr>
    <tr><td style="padding:32px;">${content}</td></tr>
    <tr><td style="padding:22px 32px;background:#F8FAFC;border-top:1px solid ${LINE};font-size:12px;color:${MUTED};line-height:1.6;">
      Winterfeld Logistik · Diese E-Mail wurde automatisch erzeugt.<br>
      Fragen? Antworten Sie einfach auf diese Nachricht.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="border-radius:10px;background:${BRAND};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

function itemsTable(data: OrderMailData): string {
  const rows = data.items
    .map(
      (item) => `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;">
  ${escapeHtml(item.name)}${item.variantName ? `<br><span style="color:${MUTED};font-size:12px;">${escapeHtml(item.variantName)}</span>` : ""}
</td>
<td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;text-align:center;color:${MUTED};">${item.quantity}×</td>
<td style="padding:10px 0;border-bottom:1px solid ${LINE};font-size:14px;text-align:right;font-weight:600;">${formatCents(item.totalCents)}</td>
</tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
${rows}
<tr><td colspan="2" style="padding:10px 0 2px;font-size:14px;color:${MUTED};">Zwischensumme</td>
    <td style="padding:10px 0 2px;text-align:right;font-size:14px;">${formatCents(data.subtotalCents)}</td></tr>
${data.depositCents ? `<tr><td colspan="2" style="padding:2px 0;font-size:14px;color:${MUTED};">Pfand</td>
    <td style="padding:2px 0;text-align:right;font-size:14px;">${formatCents(data.depositCents)}</td></tr>` : ""}
<tr><td colspan="2" style="padding:2px 0;font-size:14px;color:${MUTED};">Versand (${escapeHtml(data.shippingMethodLabel)})</td>
    <td style="padding:2px 0;text-align:right;font-size:14px;">${formatCents(data.shippingCents)}</td></tr>
<tr><td colspan="2" style="padding:2px 0 10px;font-size:12px;color:${MUTED};">enthaltene MwSt.</td>
    <td style="padding:2px 0 10px;text-align:right;font-size:12px;color:${MUTED};">${formatCents(data.taxCents)}</td></tr>
<tr><td colspan="2" style="padding:12px 0;border-top:2px solid ${INK};font-size:16px;font-weight:800;">Gesamt</td>
    <td style="padding:12px 0;border-top:2px solid ${INK};text-align:right;font-size:16px;font-weight:800;">${formatCents(data.totalCents)}</td></tr>
</table>`;
}

const heading = (text: string) =>
  `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:800;">${escapeHtml(text)}</h1>`;
const para = (text: string) =>
  `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;color:${INK};">${text}</p>`;

export function orderConfirmationMail(data: OrderMailData) {
  return {
    subject: `Bestellbestätigung ${data.orderNumber} – Winterfeld Logistik`,
    html: layout(
      "Bestellbestätigung",
      `Ihre Bestellung ${data.orderNumber} ist eingegangen.`,
      heading("Vielen Dank für Ihre Bestellung!") +
        para(`Hallo ${escapeHtml(data.customerName)}, wir haben Ihre Bestellung <strong>${escapeHtml(data.orderNumber)}</strong> erhalten. Sobald die Zahlung bestätigt ist, bereiten wir den Versand vor.`) +
        itemsTable(data) +
        button(data.orderUrl, "Bestellung ansehen"),
    ),
  };
}

export function paymentConfirmationMail(data: OrderMailData) {
  return {
    subject: `Zahlung erhalten – Bestellung ${data.orderNumber}`,
    html: layout(
      "Zahlungsbestätigung",
      `Zahlungseingang für ${data.orderNumber} bestätigt.`,
      heading("Zahlung bestätigt") +
        para(`Hallo ${escapeHtml(data.customerName)}, wir haben Ihre Zahlung über <strong>${formatCents(data.totalCents)}</strong> für die Bestellung <strong>${escapeHtml(data.orderNumber)}</strong> erhalten. Ihre Ware wird jetzt kommissioniert.`) +
        button(data.orderUrl, "Bestellstatus verfolgen"),
    ),
  };
}

export function shippingConfirmationMail(data: OrderMailData) {
  const tracking = data.trackingNumber
    ? para(`Sendungsnummer: <strong>${escapeHtml(data.trackingNumber)}</strong>`) +
      (data.trackingUrl ? button(data.trackingUrl, "Sendung verfolgen") : "")
    : "";
  return {
    subject: `Ihre Bestellung ${data.orderNumber} ist unterwegs`,
    html: layout(
      "Versandbestätigung",
      `${data.orderNumber} wurde versendet.`,
      heading("Ihre Sendung ist unterwegs") +
        para(`Hallo ${escapeHtml(data.customerName)}, Ihre Bestellung <strong>${escapeHtml(data.orderNumber)}</strong> wurde mit <strong>${escapeHtml(data.shippingMethodLabel)}</strong> versendet.`) +
        tracking +
        itemsTable(data),
    ),
  };
}

export function cancellationMail(data: OrderMailData) {
  return {
    subject: `Bestellung ${data.orderNumber} storniert`,
    html: layout(
      "Stornierung",
      `${data.orderNumber} wurde storniert.`,
      heading("Bestellung storniert") +
        para(`Hallo ${escapeHtml(data.customerName)}, Ihre Bestellung <strong>${escapeHtml(data.orderNumber)}</strong> wurde storniert.${data.reason ? ` Grund: ${escapeHtml(data.reason)}` : ""}`) +
        para("Bereits geleistete Zahlungen werden vollständig erstattet."),
    ),
  };
}

export function refundMail(data: OrderMailData) {
  return {
    subject: `Erstattung zu Bestellung ${data.orderNumber}`,
    html: layout(
      "Erstattung",
      `Erstattung für ${data.orderNumber} veranlasst.`,
      heading("Erstattung veranlasst") +
        para(`Hallo ${escapeHtml(data.customerName)}, wir haben für die Bestellung <strong>${escapeHtml(data.orderNumber)}</strong> eine Erstattung über <strong>${formatCents(data.refundAmountCents ?? 0)}</strong> veranlasst.`) +
        para("Je nach Zahlungsmittel dauert die Gutschrift 2–10 Werktage."),
    ),
  };
}

export function passwordResetMail(params: { name: string; resetUrl: string }) {
  return {
    subject: "Passwort zurücksetzen – Winterfeld Logistik",
    html: layout(
      "Passwort zurücksetzen",
      "Link zum Zurücksetzen Ihres Passworts.",
      heading("Passwort zurücksetzen") +
        para(`Hallo ${escapeHtml(params.name)}, mit dem folgenden Link setzen Sie Ihr Passwort neu. Der Link ist 60 Minuten gültig.`) +
        button(params.resetUrl, "Neues Passwort festlegen") +
        para(`<span style="color:${MUTED};font-size:13px;">Sie haben keine Zurücksetzung angefordert? Dann ignorieren Sie diese E-Mail einfach.</span>`),
    ),
  };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
