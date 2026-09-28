/* Winterfeld Logistik – Admin-SPA. Nutzt ausschließlich die abgesicherte REST-API. */
"use strict";

const API = "/api/v1";

// „Angemeldet bleiben“: Anmeldung im dauerhaften Speicher (bleibt nach dem
// Schließen des Browsers), sonst nur für diesen Tab. Der Erneuerungsschlüssel
// gilt 14 Tage und wird bei jeder Nutzung verlängert.
const MERKEN = "wf_merken";
function merkeAnmeldung() {
  try { return localStorage.getItem(MERKEN) === "1"; } catch (_) { return false; }
}
function speicher() {
  try { return merkeAnmeldung() ? localStorage : sessionStorage; } catch (_) { return sessionStorage; }
}
function lesen(schluessel) {
  try { return speicher().getItem(schluessel); } catch (_) { return null; }
}
let accessToken = lesen("wf_access") || null;
let refreshToken = lesen("wf_refresh") || null;
let currentUser = null;

// ── API-Helfer ───────────────────────────────────────────────────────────────

async function api(path, options = {}, retry = true) {
  const headers = Object.assign({}, options.headers || {});
  if (accessToken) headers["Authorization"] = "Bearer " + accessToken;
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    options = Object.assign({}, options, { body: JSON.stringify(options.body) });
  }
  const res = await fetch(API + path, Object.assign({}, options, { headers }));
  if (res.status === 401 && retry && refreshToken) {
    const ok = await tryRefresh();
    if (ok) return api(path, options, false);
    showLogin();
    throw new Error("Sitzung abgelaufen");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = fehlertext((await res.json()).detail); } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Fehlerantwort der API lesbar machen, z. B. „Verkaufspreis: kein gültiger Geldbetrag“. */
function fehlertext(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const namen = Object.fromEntries(ARTIKEL_GRUPPEN.flatMap(([, felder]) => felder.map(([k, l]) => [k, l])));
    return detail.map((e) => {
      const feld = (e.loc || []).at(-1);
      return `${namen[feld] || feld}: ${String(e.msg || "").replace(/^Value error, /, "")}`;
    }).join("; ");
  }
  if (detail && typeof detail === "object") return detail.detail || JSON.stringify(detail);
  return String(detail);
}

/**
 * Anmeldung erneuern. Mit „Angemeldet bleiben“ teilen sich alle Tabs die
 * Schlüssel: Erneuern zwei Tabs gleichzeitig, benutzt einer einen schon
 * verbrauchten Schlüssel – der Server widerruft dann aus Sicherheitsgründen
 * alle Anmeldungen (auch die der App). Daher erneuert immer nur ein Tab,
 * und wer danach kommt, übernimmt dessen neue Schlüssel.
 */
async function tryRefresh() {
  const verbraucht = refreshToken;
  const erneuern = async () => {
    const aktuell = lesen("wf_refresh");
    if (aktuell && aktuell !== verbraucht) {
      accessToken = lesen("wf_access"); refreshToken = aktuell;
      return true;
    }
    return anmeldungErneuern();
  };
  if (navigator.locks && merkeAnmeldung()) {
    return navigator.locks.request("wf-anmeldung-erneuern", erneuern);
  }
  return erneuern();
}

async function anmeldungErneuern() {
  try {
    const res = await fetch(API + "/auth/refresh", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false;
    const body = await res.json();
    setTokens(body.access_token, body.refresh_token);
    return true;
  } catch (_) { return false; }
}

function setTokens(access, refresh) {
  accessToken = access; refreshToken = refresh;
  try {
    speicher().setItem("wf_access", access);
    speicher().setItem("wf_refresh", refresh);
  } catch (_) { /* ohne Speicher gilt die Anmeldung nur bis zum Neuladen */ }
}

function clearTokens() {
  accessToken = refreshToken = null;
  for (const ablage of [sessionStorage, localStorage]) {
    try { ablage.removeItem("wf_access"); ablage.removeItem("wf_refresh"); } catch (_) {}
  }
}

// ── Views ────────────────────────────────────────────────────────────────────

const main = () => document.getElementById("main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Deutsche Namen für alle Status (Artikel, Veröffentlichung, Aufträge). */
const STATUS_TEXT = {
  // Artikel
  draft: "Entwurf", photo_uploaded: "Foto hochgeladen", recognition_running: "Erkennung läuft",
  product_identified: "Produkt erkannt", price_research_running: "Preisrecherche läuft",
  images_optimizing: "Bilder werden optimiert", shoptext_generating: "Shoptext wird geschrieben",
  review_required: "Zu prüfen", shop_ready: "Shopbereit", published: "Veröffentlicht",
  error: "Fehler",
  // Veröffentlichung
  ready: "Bereit", publishing: "Wird veröffentlicht", publish_failed: "Veröffentlichung fehlgeschlagen",
  pending: "Wartet", delisted: "Aus dem Shop genommen",
  // Aufträge
  queued: "Wartet", running: "Läuft", done: "Erledigt",
  failed: "Fehlgeschlagen – wird wiederholt", dead: "Abgebrochen",
  ok: "OK", budget: "Budget",
};
const JOB_TEXT = {
  recognize_product: "Bilderkennung", research_product: "Produktrecherche",
  research_prices: "Preisrecherche", transcribe_voice: "Sprachaufnahme abschreiben",
  extract_voice_data: "Sprachangaben auswerten", optimize_images: "Bilder optimieren",
  generate_shoptext: "Shoptext schreiben", publish_product: "Im Shop veröffentlichen",
  sync_stock: "Bestand an den Shop melden", cleanup_voice: "Sprachaufnahme löschen",
};

function statusBadge(status) {
  const ok = ["published", "done", "shop_ready", "ok", "ready"];
  const err = ["dead", "error", "failed", "publish_failed"];
  const cls = ok.includes(status) ? "ok" : err.includes(status) ? "err" : "warn";
  return `<span class="badge ${cls}" title="${esc(status)}">${esc(STATUS_TEXT[status] || status)}</span>`;
}

const fmtDate = (s) => (s ? new Date(s).toLocaleString("de-DE") : "–");
const fmtMoney = (v) => (v == null ? "–" : Number(v).toLocaleString("de-DE",
  { style: "currency", currency: "EUR" }));

// ── KI-Kosten ────────────────────────────────────────────────────────────────
const KI_ZWECK = {
  vision: "Bilderkennung", product_research: "Produktrecherche", price_research: "Preisrecherche",
  extraction: "Sprachauswertung", shoptext: "Shoptext", stt: "Transkription",
  budget_freigabe: "Budget-Freigabe",
};
/** US-Dollar mit bis zu 4 Nachkommastellen – einzelne Läufe kosten Bruchteile eines Cents. */
const fmtUsd = (v) => (v == null ? "–" : Number(v).toLocaleString("de-DE",
  { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }));
const fmtZahl = (n) => (n == null ? "–" : Number(n).toLocaleString("de-DE"));

function kiKostenUebersicht(k) {
  if (!k) return "";
  const m = k.monat, z = k.zeitraum;
  const posten = Object.entries(z.nach_zweck || {})
    .map(([kind, v]) => [KI_ZWECK[kind] || kind, Number(v.usd), v.laeufe])
    .sort((a, b) => b[1] - a[1]);
  const gesamt = Number(z.gesamt_usd) || 0;
  return `
    <section class="card">
      <h3>KI-Kosten</h3>
      <div class="stat-grid">
        ${[["Dieser Monat", fmtUsd(m.gesamt_usd)], ["Artikel diesen Monat", fmtZahl(m.artikel)],
           ["Schnitt je Artikel", fmtUsd(m.schnitt_je_artikel_usd)],
           ["Recherchen wiederverwendet", fmtZahl(m.wiederverwendet)]]
          .map(([label, wert]) => `<div class="stat"><div class="num">${wert}</div>
             <div class="muted">${label}</div></div>`).join("")}
      </div>
      <h4 style="margin:18px 0 8px">Wofür – letzte 30 Tage (${fmtUsd(z.gesamt_usd)})</h4>
      ${posten.length ? `<div class="table-wrap"><table class="ki-anteile"><tbody>${posten.map(([name, usd, n]) => `
        <tr><td>${esc(name)}</td>
          <td class="ki-balken"><span style="width:${gesamt ? (usd / gesamt * 100).toFixed(1) : 0}%"></span></td>
          <td class="zahl">${fmtUsd(usd)}</td>
          <td class="zahl muted">${gesamt ? Math.round(usd / gesamt * 100) : 0} %<span class="ki-laeufe"> · ${n} ${n === 1 ? "Lauf" : "Läufe"}</span></td></tr>`).join("")}
        </tbody></table></div>` : '<p class="muted">Noch keine gemessenen KI-Läufe.</p>'}
      <p style="margin-top:10px">Modell <strong>${esc(k.modell || "–")}</strong> ·
        Budget je Artikel <strong>${fmtUsd(k.budget_je_artikel_usd)}</strong>
        <span class="muted">(Einstellung ANTHROPIC_MODEL bzw. KI_BUDGET_JE_ARTIKEL_USD in der .env)</span></p>
      <p class="muted" style="margin-top:6px">${fmtZahl(z.eingabe_tokens)} Eingabe- und
        ${fmtZahl(z.ausgabe_tokens)} Ausgabe-Tokens, ${fmtZahl(z.websuchen)} Websuchen.
        Listenpreise der Anthropic-API in US-Dollar; gemessen wird seit dem Update, ältere Läufe fehlen.</p>
    </section>`;
}

function kiKostenArtikel(k) {
  if (!k) return "";
  const laeufe = k.laeufe || [];
  const ohneKosten = ["wiederverwendet", "budget", "freigabe"];
  return `
    <section class="card"><h3>KI-Kosten dieses Artikels: ${fmtUsd(k.summe_usd)}
        <span class="muted" style="font-weight:400">von ${fmtUsd(k.budget_usd)} Budget</span></h3>
      ${laeufe.length ? `<div class="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Schritt</th>
        <th>Modell</th><th class="zahl">Eingabe</th><th class="zahl">Ausgabe</th>
        <th class="zahl">Websuchen</th><th class="zahl">Kosten</th></tr></thead><tbody>
        ${laeufe.map((l) => `<tr><td>${fmtDate(l.created_at)}</td>
          <td>${esc(KI_ZWECK[l.kind] || l.kind)}${l.status === "budget"
            ? ` <span class="badge warn" title="${esc(l.error || "")}">ausgelassen: Budget</span>`
            : l.status !== "ok" ? ' <span class="badge err">Fehler</span>' : ""}</td>
          <td class="muted">${l.provider === "wiederverwendet" ? "wiederverwendet (gleiche EAN)"
            : l.provider === "freigabe" ? "von Hand freigegeben"
            : l.status === "budget" ? "–" : esc(l.model || l.provider || "–")}</td>
          <td class="zahl">${fmtZahl(l.input_tokens)}</td><td class="zahl">${fmtZahl(l.output_tokens)}</td>
          <td class="zahl">${fmtZahl(l.web_searches)}</td>
          <td class="zahl">${ohneKosten.includes(l.provider) ? "0 $" : fmtUsd(l.cost_usd)}</td></tr>`).join("")}
        </tbody></table></div>` : '<p class="muted">Für diesen Artikel lief noch keine KI.</p>'}
      ${k.ungemessen ? `<p class="muted">${k.ungemessen} Lauf/Läufe vor dem Update – ohne gemessenen Verbrauch.</p>` : ""}
      ${k.gebremst && darfFreigeben() ? `<p>Die KI-Bremse hat Schritte ausgelassen.
        <button class="btn small" type="button" id="ki-budget-freigeben">Weitere ${fmtUsd(k.budget_je_freigabe_usd || "0.35")} freigeben und fortsetzen</button>
        <span id="ki-budget-meldung"></span></p>` : ""}
    </section>`;
}

const views = {
  async dashboard() {
    const [d, kosten] = await Promise.all([api("/dashboard"), api("/ki-kosten").catch(() => null)]);
    main().innerHTML = `
      <h2>Systemstatus</h2>
      <div class="stat-grid">
        ${[["Artikel heute", d.products_today], ["Artikel gesamt", d.products_total],
           ["Noch zu prüfen", d.review_required], ["Shopbereit", d.shop_ready],
           ["Veröffentlicht", d.published], ["Offene Jobs", d.pending_jobs]]
          .map(([label, num]) => `<div class="card stat"><div class="num">${num}</div>
             <div class="muted">${label}</div></div>`).join("")}
      </div>
      ${d.failed_jobs > 0 ? `<div class="card"><span class="badge err">${d.failed_jobs}
          endgültig fehlgeschlagene Jobs</span> – siehe <a href="#jobs">Jobs &amp; Fehler</a></div>` : ""}
      ${kiKostenUebersicht(kosten)}`;
  },

  async products() {
    const page = await api("/products?limit=100");
    main().innerHTML = `
      <h2>Artikel (${page.total})</h2>
      <p class="muted">Zum Ändern aller Angaben einen Artikel anklicken oder „Bearbeiten“ wählen.</p>
      <div class="toolbar"><label>Suche <input id="prod-search" placeholder="Name, SKU, EAN …"></label>
        <button class="btn" id="prod-search-btn">Suchen</button></div>
      <div class="table-wrap" id="prod-table"></div>`;
    const render = (items) => {
      document.getElementById("prod-table").innerHTML = `<table><thead><tr>
        <th>SKU</th><th>Name</th><th>EAN</th><th>Bestand</th><th>VK</th>
        <th>Status</th><th>Shop</th><th>Lagerplatz</th></tr></thead><tbody>
        ${items.map((p) => `<tr><td>${esc(p.internal_sku)}</td>
          <td><a href="#artikel/${p.id}">${esc(p.product_name || "(ohne Namen)")}</a><br><span class="muted">${esc(p.manufacturer || "")}</span>
            <br><a class="btn small" href="#artikel/${p.id}" style="margin-top:6px">Bearbeiten</a></td>
          <td>${esc(p.ean || "–")}</td><td>${p.stock_quantity} (${p.available_quantity} verf.)</td>
          <td>${fmtMoney(p.sale_price)}</td><td>${statusBadge(p.processing_status)}</td>
          <td>${statusBadge(p.publication_status)}</td>
          <td>${esc(p.storage_location_code || "–")}</td></tr>`).join("")}
        </tbody></table>`;
    };
    render(page.items);
    document.getElementById("prod-search-btn").onclick = async () => {
      const q = document.getElementById("prod-search").value;
      render((await api("/products?limit=100&q=" + encodeURIComponent(q))).items);
    };
  },

  // ── Freigabe: Bilder prüfen, Hauptbild wählen, veröffentlichen ─────────────
  // Hier sieht man vor der Veröffentlichung, was der Shop tatsächlich bekommt:
  // je Aufnahme das Original und daneben die optimierte Fassung. Originale
  // werden nie verändert oder gelöscht – abgelehnt wird nur die Optimierung.

  async freigabe(productId) {
    if (productId) return freigabeDetail(productId);
    const [bereit, pruefen] = await Promise.all([
      api("/products?status=shop_ready&limit=100"),
      api("/products?status=review_required&limit=100"),
    ]);
    const items = [...bereit.items, ...pruefen.items];
    main().innerHTML = `
      <h2>Freigabe</h2>
      <p class="muted">${bereit.total} shopbereit · ${pruefen.total} noch zu prüfen.
        Klick auf eine Kachel öffnet die Bildprüfung.</p>
      ${items.length === 0 ? '<div class="card muted">Nichts zu tun – alle Artikel sind veröffentlicht oder noch in Bearbeitung.</div>' : ""}
      <div class="freigabe-grid">
        ${items.map((p) => {
          const bild = hauptbild(p);
          const optimiert = p.images.filter((i) => i.kind === "optimized").length;
          return `<a class="kachel card" href="#freigabe/${p.id}">
            <div class="kachel-bild">${bild
              ? `<img src="${esc(bild.url)}" alt="" loading="lazy">`
              : '<span class="muted">kein Bild</span>'}</div>
            <div class="kachel-text">
              <strong>${esc(p.product_name || "(ohne Namen)")}</strong>
              <span class="muted">${esc(p.internal_sku)}${p.manufacturer ? " · " + esc(p.manufacturer) : ""}</span>
              <span>${fmtMoney(p.sale_price)} · ${p.available_quantity} verfügbar</span>
              <span>${statusBadge(p.processing_status)}
                <span class="muted">${optimiert} optimierte Bild${optimiert === 1 ? "" : "er"}</span></span>
            </div></a>`;
        }).join("")}
      </div>`;
  },

  async artikel(productId) {
    if (!productId) { location.hash = "#products"; return; }
    return artikelDetail(productId);
  },

  async suppliers() {
    const suppliers = await api("/suppliers");
    main().innerHTML = `
      <h2>Lieferanten</h2>
      <form id="supplier-form" class="card form-grid" style="margin-bottom:16px">
        <label>Firmenname <input name="name" required></label>
        <label>Ansprechpartner <input name="contact_person"></label>
        <label>Telefon <input name="phone"></label>
        <label>E-Mail <input name="email" type="email"></label>
        <label>Kundennummer <input name="customer_number"></label>
        <label>Zahlungsbedingungen <input name="payment_terms"></label>
        <button class="btn primary" type="submit">Anlegen</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Kontakt</th>
        <th>Telefon</th><th>E-Mail</th><th>Kundennr.</th></tr></thead><tbody>
        ${suppliers.map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(s.contact_person || "–")}</td>
          <td>${esc(s.phone || "–")}</td><td>${esc(s.email || "–")}</td>
          <td>${esc(s.customer_number || "–")}</td></tr>`).join("")}
      </tbody></table></div>`;
    document.getElementById("supplier-form").onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      await api("/suppliers", { method: "POST", body: data });
      views.suppliers();
    };
  },

  async locations() {
    const locations = await api("/storage-locations");
    const kinds = { site: "Standort", hall: "Halle", area: "Bereich",
                    shelf: "Regal", level: "Ebene", bin: "Fach" };
    main().innerHTML = `
      <h2>Lagerplätze</h2>
      <form id="loc-form" class="card form-grid" style="margin-bottom:16px">
        <label>Ebene <select name="kind">${Object.entries(kinds).map(([v, l]) =>
          `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label>Name <input name="name" required placeholder="z. B. 2 oder B4"></label>
        <label>Übergeordnet <select name="parent_id"><option value="">– keiner –</option>
          ${locations.map((l) => `<option value="${l.id}">${esc(l.code)}</option>`).join("")}
        </select></label>
        <button class="btn primary" type="submit">Anlegen</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>Code</th><th>Ebene</th><th>Name</th></tr>
      </thead><tbody>${locations.map((l) => `<tr><td>${esc(l.code)}</td>
        <td>${esc(kinds[l.kind] || l.kind)}</td><td>${esc(l.name)}</td></tr>`).join("")}
      </tbody></table></div>`;
    document.getElementById("loc-form").onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      if (!data.parent_id) delete data.parent_id;
      await api("/storage-locations", { method: "POST", body: data });
      views.locations();
    };
  },

  async users() {
    const users = await api("/users");
    const roles = { employee: "Mitarbeiter", warehouse_manager: "Lagerleiter",
                    shop_manager: "Shop-Manager", admin: "Administrator" };
    main().innerHTML = `
      <h2>Benutzer</h2>
      <form id="user-form" class="card form-grid" style="margin-bottom:16px">
        <label>E-Mail <input name="email" type="email" required></label>
        <label>Anzeigename <input name="display_name" required></label>
        <label>Rolle <select name="role">${Object.entries(roles).map(([v, l]) =>
          `<option value="${v}">${l}</option>`).join("")}</select></label>
        <label>Passwort <input name="password" type="password" required minlength="10"></label>
        <button class="btn primary" type="submit">Anlegen</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>E-Mail</th><th>Name</th><th>Rolle</th>
        <th>Status</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.display_name)}</td>
          <td>${esc(roles[u.role] || u.role)}</td>
          <td>${u.is_active ? '<span class="badge ok">aktiv</span>'
                            : '<span class="badge err">inaktiv</span>'}</td>
          <td><button class="btn small" data-toggle="${u.id}" data-active="${u.is_active}">
            ${u.is_active ? "Deaktivieren" : "Aktivieren"}</button></td></tr>`).join("")}
      </tbody></table></div>`;
    document.getElementById("user-form").onsubmit = async (e) => {
      e.preventDefault();
      await api("/users", { method: "POST",
        body: Object.fromEntries(new FormData(e.target).entries()) });
      views.users();
    };
    main().querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.onclick = async () => {
        await api("/users/" + btn.dataset.toggle, { method: "PATCH",
          body: { is_active: btn.dataset.active !== "true" } });
        views.users();
      };
    });
  },

  async connections() {
    const [connections, types] = await Promise.all([
      api("/shop/connections"), api("/shop/connector-types")]);
    main().innerHTML = `
      <h2>Shop-Verbindungen</h2>
      <form id="conn-form" class="card form-grid" style="margin-bottom:16px">
        <label>Name <input name="name" required></label>
        <label>Typ <select name="connector_type">${types.types.map((t) =>
          `<option>${esc(t)}</option>`).join("")}</select></label>
        <label>Basis-URL <input name="base_url" required placeholder="https://shop.example.de"></label>
        <label>Consumer Key <input name="consumer_key"></label>
        <label>Consumer Secret <input name="consumer_secret" type="password"></label>
        <label>Webhook-Secret <input name="webhook_secret"></label>
        <button class="btn primary" type="submit">Anlegen</button>
      </form>
      <div class="table-wrap"><table><thead><tr><th>Name</th><th>Typ</th><th>URL</th>
        <th>Credentials</th><th>Status</th><th></th></tr></thead><tbody>
        ${connections.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.connector_type)}</td>
          <td>${esc(c.base_url)}</td>
          <td>${c.has_credentials ? "hinterlegt (verschlüsselt)" : "–"}</td>
          <td>${c.is_active ? '<span class="badge ok">aktiv</span>'
                            : '<span class="badge err">inaktiv</span>'}</td>
          <td><button class="btn small" data-test="${c.id}">Verbindung testen</button></td>
          </tr>`).join("")}
      </tbody></table></div>
      <p id="conn-result"></p>`;
    document.getElementById("conn-form").onsubmit = async (e) => {
      e.preventDefault();
      const raw = Object.fromEntries(new FormData(e.target).entries());
      const body = { name: raw.name, connector_type: raw.connector_type,
                     base_url: raw.base_url, webhook_secret: raw.webhook_secret || null };
      if (raw.consumer_key || raw.consumer_secret)
        body.credentials = { consumer_key: raw.consumer_key,
                             consumer_secret: raw.consumer_secret };
      await api("/shop/connections", { method: "POST", body });
      views.connections();
    };
    main().querySelectorAll("[data-test]").forEach((btn) => {
      btn.onclick = async () => {
        const out = document.getElementById("conn-result");
        out.textContent = "Teste …";
        try {
          await api("/shop/connections/" + btn.dataset.test + "/test", { method: "POST" });
          out.innerHTML = '<span class="ok">✓ Verbindung erfolgreich</span>';
        } catch (err) { out.innerHTML = `<span class="error">${esc(err.message)}</span>`; }
      };
    });
  },

  async aufgaben() {
    const daten = await api("/products/aufgaben");
    aufgabenZahl(daten.artikel.length);
    const zeile = (a) => {
      const punkte = [
        ...a.fragen.map((t) => `<li>❓ ${esc(t)}</li>`),
        ...a.fehlt.map((t) => `<li>Fehlt: ${esc(t)}</li>`),
        ...(a.ki_gebremst ? ["<li>KI-Budget aufgebraucht – im Artikel freigeben oder von Hand ergänzen</li>"] : []),
        ...(a.processing_status === "error" ? ["<li>Verarbeitung fehlgeschlagen</li>"] : []),
      ];
      return `<tr><td><a href="#artikel/${esc(a.id)}"><strong>${esc(a.product_name || "Unbenannter Artikel")}</strong></a>
          <br><span class="muted">${esc(a.internal_sku)}</span></td>
        <td>${statusBadge(a.processing_status)}</td>
        <td><ul class="aufgaben-liste">${punkte.join("")}</ul></td>
        <td><a class="btn small" href="#artikel/${esc(a.id)}">Bearbeiten</a></td></tr>`;
    };
    main().innerHTML = `
      <h2>Offene Aufgaben</h2>
      <p class="muted">Artikel, bei denen Angaben fehlen oder Fragen offen sind. Artikel, an denen die KI
        gerade arbeitet, erscheinen erst danach.</p>
      ${daten.fehlgeschlagene_auftraege ? `<p class="error">${daten.fehlgeschlagene_auftraege} abgebrochene(r)
        Auftrag/Aufträge – siehe <a href="#jobs">Jobs &amp; Fehler</a>.</p>` : ""}
      ${daten.artikel.length ? `<div class="table-wrap"><table><thead><tr><th>Artikel</th><th>Status</th>
          <th>Was zu tun ist</th><th></th></tr></thead><tbody>
          ${daten.artikel.map(zeile).join("")}</tbody></table></div>`
        : '<div class="card"><p>✓ Keine offenen Aufgaben – alle Artikel sind vollständig.</p></div>'}`;
  },

  async jobs() {
    const jobs = await api("/jobs");
    main().innerHTML = `
      <h2>Jobs &amp; Synchronisationsfehler</h2>
      <p class="muted">Aufträge, die im Hintergrund laufen – KI-Schritte, Bilder, Veröffentlichung, Bestandsabgleich.</p>
      <div class="table-wrap"><table><thead><tr><th>Auftrag</th><th>Artikel</th><th>Status</th>
        <th>Versuche</th><th>Nächster Lauf</th><th>Letzter Fehler</th><th></th></tr>
      </thead><tbody>
        ${jobs.map((j) => {
          // Ein Auftrag, der lange auf „running“ steht, ist beim Neustart des
          // Servers abgebrochen; der Worker plant ihn nach 15 Minuten selbst neu ein.
          const minuten = j.locked_at ? (Date.now() - new Date(j.locked_at)) / 60000 : 0;
          const haengt = j.status === "running" && minuten >= 15;
          const laeuft = j.status === "running" && !haengt
            ? `<br><span class="muted">läuft seit ${Math.max(1, Math.round(minuten))} Min.</span>` : "";
          return `<tr><td title="${esc(j.job_type)}">${esc(JOB_TEXT[j.job_type] || j.job_type)}</td>
          <td>${j.product_id ? `<a href="#artikel/${esc(j.product_id)}">öffnen</a>` : "–"}</td>
          <td>${haengt ? '<span class="badge err">Hängt</span>' : statusBadge(j.status)}${laeuft}</td>
          <td>${j.attempts}/${j.max_attempts}</td><td>${fmtDate(j.run_at)}</td>
          <td class="muted">${esc((j.last_error || "").slice(0, 300))}</td>
          <td>${["dead", "failed"].includes(j.status) || haengt
            ? `<button class="btn small" data-retry="${j.id}">Erneut versuchen</button>` : ""}</td>
          </tr>`;
        }).join("")}
      </tbody></table></div>`;
    main().querySelectorAll("[data-retry]").forEach((btn) => {
      btn.onclick = async () => {
        await api("/jobs/" + btn.dataset.retry + "/retry", { method: "POST" });
        views.jobs();
      };
    });
  },

  async audit() {
    const entries = await api("/audit-log?limit=200");
    main().innerHTML = `
      <h2>Audit-Log</h2>
      <div class="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Benutzer</th>
        <th>Objekt</th><th>Aktion</th><th>Feld</th><th>Alt → Neu</th><th>Grund</th></tr>
      </thead><tbody>
        ${entries.map((a) => `<tr><td>${fmtDate(a.created_at)}</td>
          <td>${esc(a.user_name || "System")}</td>
          <td>${esc(a.entity_type)}<br><span class="muted">${esc(a.entity_id || "")}</span></td>
          <td>${esc(a.action)}</td><td>${esc(a.field || "–")}</td>
          <td>${esc(a.old_value || "–")} → ${esc(a.new_value || "–")}</td>
          <td class="muted">${esc(a.reason || "")}</td></tr>`).join("")}
      </tbody></table></div>`;
  },
};

// ── Freigabe-Detail ──────────────────────────────────────────────────────────

const BILDROLLEN = { front: "Vorderseite", back: "Rückseite", packaging: "Verpackung",
  barcode: "Barcode", type_plate: "Typenschild", serial_number: "Seriennummer",
  accessories: "Zubehör", damage: "Schaden", other: "Sonstiges" };

/** Das Bild, das der Shop als erstes zeigen würde: Hauptbild, sonst erstes optimiertes. */
function hauptbild(product) {
  const optimiert = product.images.filter((i) => i.kind === "optimized");
  return optimiert.find((i) => i.is_primary) || optimiert[0] || null;
}

/** Original und zugehörige Optimierung nebeneinander – so, wie sie zusammengehören. */
function bildpaare(product) {
  const originale = product.images.filter((i) => i.kind === "original");
  const optimierte = product.images.filter((i) => i.kind === "optimized");
  const paare = originale.map((o) => ({
    original: o,
    optimiert: optimierte.filter((x) => x.source_image_id === o.id),
  }));
  // Optimierungen ohne bekanntes Original (z. B. Import) nicht verschlucken.
  const zugeordnet = new Set(paare.flatMap((p) => p.optimiert.map((x) => x.id)));
  for (const x of optimierte) {
    if (!zugeordnet.has(x.id)) paare.push({ original: null, optimiert: [x] });
  }
  return paare.sort((a, b) => {
    const ra = (a.original || a.optimiert[0]).role, rb = (b.original || b.optimiert[0]).role;
    return (ra !== "front") - (rb !== "front")
      || (a.original || a.optimiert[0]).sort_order - (b.original || b.optimiert[0]).sort_order;
  });
}

function darfFreigeben() {
  return ["shop_manager", "warehouse_manager", "admin"].includes(currentUser?.role);
}

async function freigabeDetail(productId) {
  const [product, quality, connections] = await Promise.all([
    api("/products/" + productId),
    api("/products/" + productId + "/quality"),
    api("/shop/connections").catch(() => []),
  ]);
  const aktiv = connections.filter((c) => c.is_active);
  const paare = bildpaare(product);
  const optimierte = product.images.filter((i) => i.kind === "optimized");
  const darf = darfFreigeben();

  const figur = (bild, art) => {
    if (!bild) return `<figure class="bild-figur bild-leer"><span class="muted">${
      art === "optimized" ? "noch nicht optimiert" : "kein Original vorhanden"}</span></figure>`;
    const hauptmarke = bild.is_primary ? '<span class="hauptbild-marke">Hauptbild</span>' : "";
    const masse = bild.width && bild.height ? `${bild.width} × ${bild.height} px` : "";
    const aktionen = art === "optimized" && darf ? `<div class="bild-aktionen">
        ${bild.is_primary ? "" : `<button class="btn small" data-hauptbild="${bild.id}">Als Hauptbild</button>`}
        <button class="btn small" data-sortieren="${bild.id}" data-richtung="-1" title="weiter nach vorn">↑</button>
        <button class="btn small" data-sortieren="${bild.id}" data-richtung="1" title="weiter nach hinten">↓</button>
        <button class="btn small danger" data-ablehnen="${bild.id}">Ablehnen</button>
      </div>` : "";
    return `<figure class="bild-figur">${hauptmarke}
      <a href="${esc(bild.url)}" target="_blank" rel="noopener"><img src="${esc(bild.url)}" alt=""></a>
      <figcaption><span>${art === "optimized" ? "Optimiert" : "Original"}</span>
        <span class="muted">${masse}${bild.sort_order != null && art === "optimized" ? " · Pos. " + bild.sort_order : ""}</span>
      </figcaption>${aktionen}</figure>`;
  };

  main().innerHTML = `
    <p><a href="#freigabe">← Zurück zur Übersicht</a> · <a href="#artikel/${product.id}">Angaben bearbeiten →</a></p>
    <div class="freigabe-kopf">
      <div>
        <h2>${esc(product.product_name || "(ohne Namen)")}</h2>
        <p class="muted">${esc(product.internal_sku)}${product.manufacturer ? " · " + esc(product.manufacturer) : ""}
          ${product.model ? " · " + esc(product.model) : ""} · ${fmtMoney(product.sale_price)}
          · ${product.available_quantity} verfügbar</p>
      </div>
      <div>${statusBadge(product.processing_status)} ${statusBadge(product.publication_status)}</div>
    </div>

    <div class="card pruefliste">
      <strong>Qualitätsprüfung</strong>
      ${quality.is_shop_ready
        ? '<p class="ok">✓ Alle Pflichtangaben vorhanden – der Artikel kann veröffentlicht werden.</p>'
        : `<p class="error">Es fehlt noch:</p><ul>${quality.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>`}
      ${optimierte.length === 0 ? '<p class="error">Es gibt noch kein optimiertes Bild. Der Shop bekommt nur optimierte Bilder.</p>' : ""}
      ${optimierte.length > 0 && !optimierte.some((i) => i.is_primary)
        ? '<p class="error">Kein Hauptbild gewählt – der Shop nimmt sonst das erste optimierte Bild.</p>' : ""}
    </div>

    <h3>Bilder (${product.images.length}) – so kommen sie in den Shop</h3>
    ${!darf ? '<p class="muted">Hauptbild wählen und Bilder ablehnen dürfen Shop-Manager, Lagerleiter und Administratoren.</p>' : ""}
    ${paare.length === 0 ? '<div class="card muted">Für diesen Artikel wurden noch keine Bilder erfasst.</div>' : ""}
    ${paare.map((paar) => {
      const rolle = (paar.original || paar.optimiert[0]).role;
      const optimiert = paar.optimiert.length ? paar.optimiert : [null];
      return `<section class="bildpaar card">
        <header><strong>${esc(BILDROLLEN[rolle] || rolle)}</strong></header>
        <div class="bildpaar-spalten">
          ${figur(paar.original, "original")}
          ${optimiert.map((x) => figur(x, "optimized")).join("")}
        </div></section>`;
    }).join("")}

    ${darf ? `<div class="card" id="veroeffentlichen">
      <strong>Veröffentlichen</strong>
      ${aktiv.length === 0
        ? '<p class="muted">Keine aktive Shop-Verbindung. Unter <a href="#connections">Shop-Verbindungen</a> anlegen.</p>'
        : `<div class="toolbar">
            <label>Shop <select id="pub-conn">${aktiv.map((c) =>
              `<option value="${c.id}">${esc(c.name)} (${esc(c.connector_type)})</option>`).join("")}</select></label>
            <button class="btn primary" id="pub-btn" ${quality.is_shop_ready && optimierte.length ? "" : "disabled"}>
              Jetzt veröffentlichen</button>
          </div>`}
      <p id="pub-result"></p>
    </div>` : ""}`;

  const neuLaden = () => freigabeDetail(productId);
  const melde = (text, fehler) => {
    const out = document.getElementById("pub-result");
    if (out) out.innerHTML = `<span class="${fehler ? "error" : "ok"}">${esc(text)}</span>`;
    else alert(text);
  };
  const aktion = async (fn) => {
    try { await fn(); await neuLaden(); }
    catch (err) { melde("Fehler: " + err.message, true); }
  };

  main().querySelectorAll("[data-hauptbild]").forEach((btn) => {
    btn.onclick = () => aktion(() => api(
      `/products/${productId}/images/${btn.dataset.hauptbild}`,
      { method: "PATCH", body: { is_primary: true } }));
  });
  main().querySelectorAll("[data-sortieren]").forEach((btn) => {
    btn.onclick = () => aktion(() => {
      const bild = product.images.find((i) => i.id === btn.dataset.sortieren);
      const ziel = Math.max(0, bild.sort_order + Number(btn.dataset.richtung));
      return api(`/products/${productId}/images/${bild.id}`,
        { method: "PATCH", body: { sort_order: ziel } });
    });
  });
  main().querySelectorAll("[data-ablehnen]").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("Optimiertes Bild ablehnen? Es wird entfernt und kommt nicht in den Shop. "
                   + "Das Original bleibt erhalten.")) return;
      aktion(() => api(`/products/${productId}/images/${btn.dataset.ablehnen}`,
                       { method: "DELETE" }));
    };
  });
  const pubBtn = document.getElementById("pub-btn");
  if (pubBtn) {
    pubBtn.onclick = async () => {
      pubBtn.disabled = true;
      melde("Veröffentlichung wird gestartet …");
      try {
        const conn = document.getElementById("pub-conn").value;
        await api(`/shop/products/${productId}/publish?connection_id=${encodeURIComponent(conn)}`,
                  { method: "POST" });
        melde("✓ Veröffentlichung gestartet – Fortschritt unter „Jobs & Fehler“.");
        setTimeout(neuLaden, 1200);
      } catch (err) {
        melde("Fehler: " + err.message, true);
        pubBtn.disabled = false;
      }
    };
  }
}

// ── Artikel bearbeiten ───────────────────────────────────────────────────────
// Dieselben Angaben wie in der App (und die, die dort keinen Platz haben):
// Stammdaten, Preise, Lager, Beschreibungen, Merkmale, Shoptext. Gespeichert
// wird nur, was sich geändert hat – als Benutzerangabe, die Vorrang vor
// KI-Vermutungen hat und im Audit-Log landet.

const ZUSTAENDE = { new: "Neu", new_opened: "Neu, geöffnet", refurbished: "Generalüberholt",
  used: "Gebraucht", defective: "Defekt", unknown: "Unbekannt" };
const BEWEGUNGEN = { inbound: "Wareneingang (+)", return: "Rücknahme (+)",
  damaged: "Beschädigt / Ausschuss (−)", manual_correction: "Korrektur (±)",
  inventory_correction: "Inventur (±)" };

/** Feldgruppen: [Schlüssel, Beschriftung, Art]. Art: text | zahl | geld | datum | lang | zustand | lager | lieferant */
const ARTIKEL_GRUPPEN = [
  ["Artikel", [
    ["product_name", "Name"], ["manufacturer", "Hersteller"], ["brand", "Marke"],
    ["model", "Modell"], ["ean", "EAN / Barcode", "zahl"], ["gtin", "GTIN", "zahl"],
    ["mpn", "Herstellernummer (MPN)"], ["category", "Kategorie"], ["subcategory", "Unterkategorie"],
    ["condition", "Zustand", "zustand"], ["packaging_condition", "Verpackung"],
    ["serial_number", "Seriennummer"], ["batch_number", "Charge"],
  ]],
  ["Preise", [
    ["purchase_price_net", "Einkaufspreis netto", "geld"],
    ["purchase_price_gross", "Einkaufspreis brutto", "geld"],
    ["sale_price", "Verkaufspreis", "geld"], ["minimum_sale_price", "Mindestpreis", "geld"],
  ]],
  ["Lebensmittel & Getränke", [
    ["net_content_amount", "Füllmenge je Einheit", "menge"], ["net_content_unit", "Einheit", "einheit"],
    ["units_per_pack", "Anzahl im Gebinde", "anzahl"],
    ["deposit_amount", "Pfand gesamt je Verkaufseinheit", "geld"], ["deposit_type", "Pfandart", "pfandart"],
    ["ingredients", "Zutaten", "lang"], ["allergens", "Allergene", "lang"],
    ["food_notes", "Pflichthinweise (z. B. „Koffeinhaltig“, Aufbewahrung)", "lang"],
  ]],
  ["Lager & Einkauf", [
    ["storage_location_id", "Lagerplatz", "lager"], ["supplier_id", "Lieferant", "lieferant"],
    ["purchase_date", "Einkaufsdatum", "datum"], ["invoice_number", "Rechnungsnummer"],
  ]],
  ["Beschreibung", [
    ["short_description", "Kurzbeschreibung", "lang"], ["long_description", "Beschreibung", "lang"],
    ["notes", "Bemerkungen (intern)", "lang"],
  ]],
];

/** Merkmale (Schlüssel → Wert) als Zeilen, die man ergänzen und löschen kann. */
function merkmalEditor(name, werte) {
  const zeile = (k = "", v = "") => `<div class="merkmal-zeile">
      <input data-merkmal-k placeholder="z. B. Farbe" value="${esc(k)}">
      <input data-merkmal-v placeholder="z. B. Schwarz" value="${esc(v)}">
      <button type="button" class="btn small danger" data-merkmal-weg title="Zeile entfernen">✕</button>
    </div>`;
  const eintraege = Object.entries(werte || {});
  return `<div class="merkmale" data-merkmale="${name}">
      ${(eintraege.length ? eintraege : [["", ""]]).map(([k, v]) => zeile(k, v)).join("")}
      <button type="button" class="btn small" data-merkmal-neu>+ Zeile</button>
    </div>`;
}

function merkmaleLesen(container) {
  const ergebnis = {};
  container.querySelectorAll(".merkmal-zeile").forEach((z) => {
    const k = z.querySelector("[data-merkmal-k]").value.trim();
    const v = z.querySelector("[data-merkmal-v]").value.trim();
    if (k) ergebnis[k] = v;
  });
  return ergebnis;
}

function merkmaleAktivieren(root) {
  root.addEventListener("click", (e) => {
    if (e.target.matches("[data-merkmal-weg]")) {
      const box = e.target.closest(".merkmale");
      e.target.closest(".merkmal-zeile").remove();
      if (!box.querySelector(".merkmal-zeile")) box.querySelector("[data-merkmal-neu]").click();
    }
    if (e.target.matches("[data-merkmal-neu]")) {
      e.target.insertAdjacentHTML("beforebegin", `<div class="merkmal-zeile">
        <input data-merkmal-k placeholder="z. B. Farbe"><input data-merkmal-v placeholder="z. B. Schwarz">
        <button type="button" class="btn small danger" data-merkmal-weg title="Zeile entfernen">✕</button></div>`);
    }
  });
}

/** Wert fürs Formular: Geld mit Komma, Datum als JJJJ-MM-TT, sonst Text. */
function feldWert(product, key, art) {
  const v = product[key];
  if (v == null) return "";
  if (art === "geld") return Number(v).toFixed(2).replace(".", ",");
  if (art === "menge") return String(Number(v)).replace(".", ",");
  if (art === "datum") return String(v).slice(0, 10);
  if (art === "lang") return htmlZuText(String(v));  // keine Tags im Eingabefeld
  return String(v);
}

function feldHtml(product, [key, label, art = "text"], stamm) {
  const wert = feldWert(product, key, art);
  const quelle = (product.field_sources || {})[key];
  const hinweis = quelle && quelle !== "user" && wert
    ? `<span class="quelle" title="Herkunft der Angabe – mit eigener Eingabe überschreiben">${
        { ai: "KI", vision: "KI", research: "Recherche", voice: "Sprache" }[quelle] || esc(quelle)}</span>` : "";
  let eingabe;
  if (art === "zustand") {
    eingabe = `<select name="${key}">${Object.entries(ZUSTAENDE).map(([v, l]) =>
      `<option value="${v}" ${v === product[key] ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  } else if (art === "einheit" || art === "pfandart") {
    const optionen = art === "einheit"
      ? { ml: "ml", l: "Liter", g: "g", kg: "kg" } : { einweg: "Einweg", mehrweg: "Mehrweg" };
    eingabe = `<select name="${key}"><option value="">–</option>${Object.entries(optionen).map(([v, l]) =>
      `<option value="${v}" ${v === product[key] ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  } else if (art === "lager" || art === "lieferant") {
    const liste = art === "lager" ? stamm.lagerplaetze : stamm.lieferanten;
    const text = (x) => art === "lager" ? x.code : x.name;
    eingabe = `<select name="${key}"><option value="">– keiner –</option>${liste.map((x) =>
      `<option value="${x.id}" ${x.id === product[key] ? "selected" : ""}>${esc(text(x))}</option>`).join("")}</select>`;
  } else if (art === "lang") {
    eingabe = `<textarea name="${key}" rows="${key === "long_description" ? 8 : 3}">${esc(wert)}</textarea>`;
  } else {
    const typ = art === "datum" ? "date" : "text";
    const modus = art === "geld" ? 'inputmode="decimal" placeholder="0,00"'
      : art === "menge" ? 'inputmode="decimal" placeholder="z. B. 0,33"'
      : art === "zahl" || art === "anzahl" ? 'inputmode="numeric"' : "";
    eingabe = `<input name="${key}" type="${typ}" ${modus} value="${esc(wert)}">`;
  }
  const breit = art === "lang" ? ' class="breit"' : "";
  return `<label${breit}><span>${esc(label)} ${hinweis}</span>${eingabe}</label>`;
}

/** Grundpreis wie im Shop: Preis je 1 l bzw. 1 kg über alle Einheiten im Gebinde. */
function grundpreisText(p) {
  if (!p.sale_price || !p.net_content_amount || !p.net_content_unit) return null;
  const basis = { ml: 0.001, l: 1, g: 0.001, kg: 1 }[p.net_content_unit];
  const menge = Number(p.net_content_amount) * basis * (p.units_per_pack || 1);
  if (!menge) return null;
  const je = ["ml", "l"].includes(p.net_content_unit) ? "l" : "kg";
  return `${fmtMoney(Number(p.sale_price) / menge)}/${je}`;
}

async function artikelDetail(productId) {
  const [product, stamm, listing, bewegungen, kiKosten] = await Promise.all([
    api("/products/" + productId),
    Promise.all([api("/storage-locations").catch(() => []), api("/suppliers").catch(() => [])])
      .then(([lagerplaetze, lieferanten]) => ({ lagerplaetze, lieferanten })),
    api(`/shop/products/${productId}/listing`).catch(() => null),
    api(`/products/${productId}/stock-movements`).catch(() => []),
    api(`/products/${productId}/ki-kosten`).catch(() => null),
  ]);
  const darfBestand = ["warehouse_manager", "admin"].includes(currentUser?.role);
  const darfShoptext = darfFreigeben();
  const fragen = product.open_questions || [];

  const frageHtml = (f) => {
    let eingabe;
    if (f.kind === "candidate_select") {
      eingabe = `<div class="kandidaten">${(f.options || []).map((o) => `
        <button type="button" class="btn small" data-kandidat="${o.index}" data-frage="${f.id}">
          ${esc(o.product_name || "?")}${o.manufacturer ? " · " + esc(o.manufacturer) : ""}${o.ean ? " · EAN " + esc(o.ean) : ""}
        </button>`).join("")}</div>`;
    } else if (f.kind === "choice") {
      eingabe = `<div class="kandidaten">${(f.options || []).map((o) =>
        `<button type="button" class="btn small" data-antwort="${esc(o)}" data-frage="${f.id}" data-feld="${esc(f.field || "")}">${esc(o)}</button>`).join("")}</div>`;
    } else {
      eingabe = `<div class="toolbar" style="margin:0">
        <input data-antwort-eingabe="${f.id}" ${f.kind === "number" ? 'inputmode="numeric"' : ""} placeholder="Antwort">
        <button type="button" class="btn small primary" data-antwort-senden="${f.id}" data-feld="${esc(f.field || "")}">Übernehmen</button></div>`;
    }
    return `<div class="frage"><p>${esc(f.text)}</p>${eingabe}</div>`;
  };

  main().innerHTML = `
    <p><a href="#products">← Alle Artikel</a> · <a href="#freigabe/${product.id}">Bilder &amp; Freigabe →</a></p>
    <div class="freigabe-kopf">
      <div>
        <h2>${esc(product.product_name || "(ohne Namen)")}</h2>
        <p class="muted">${esc(product.internal_sku)} · Bestand ${product.stock_quantity}
          (${product.available_quantity} verfügbar) · angelegt ${fmtDate(product.created_at)}</p>
      </div>
      <div>${statusBadge(product.processing_status)} ${statusBadge(product.publication_status)}</div>
    </div>

    ${fragen.length ? `<div class="card fragen"><strong>Offene Fragen (${fragen.length})</strong>
      ${fragen.map(frageHtml).join("")}</div>` : ""}

    <form id="artikel-form" class="artikel-form">
      ${ARTIKEL_GRUPPEN.map(([titel, felder]) => `
        <section class="card"><h3>${titel}</h3>
          <div class="form-grid">${felder.map((f) => feldHtml(product, f, stamm)).join("")}</div>
          ${titel === "Lebensmittel & Getränke" ? `<p class="muted marktpreis">Nur bei Lebensmitteln und Getränken ausfüllen.
            Pfand ist der Gesamtbetrag je Verkaufseinheit (6er Träger à 0,25 € = 1,50 €).
            ${grundpreisText(product) ? `Grundpreis im Shop: <strong>${grundpreisText(product)}</strong>` : ""}</p>` : ""}
          ${titel === "Preise" && (product.recommended_sale_price || product.lowest_market_price) ? `
            <p class="muted marktpreis">Marktpreis ${fmtMoney(product.lowest_market_price)} – ${fmtMoney(product.highest_market_price)}
              ${product.recommended_sale_price ? ` · empfohlen <strong>${fmtMoney(product.recommended_sale_price)}</strong>
                <button type="button" class="btn small" id="empfehlung">Als Verkaufspreis übernehmen</button>` : ""}</p>` : ""}
        </section>`).join("")}
      <section class="card"><h3>Merkmale</h3>
        <p class="muted">Erscheinen im Shop als Eigenschaftsliste, z. B. Farbe, Maße, Material.</p>
        ${merkmalEditor("attributes", product.attributes)}
        <h3 style="margin-top:18px">Technische Daten</h3>
        ${merkmalEditor("technical_data", product.technical_data)}
      </section>
      <div class="speicherleiste">
        <button class="btn primary" type="submit">Änderungen speichern</button>
        <span id="artikel-meldung"></span>
      </div>
    </form>

    <section class="card"><h3>Shoptext</h3>
      ${listing ? `<form id="shoptext-form" class="form-grid">
          <label class="breit"><span>SEO-Titel (max. 200 Zeichen)</span><input name="seo_title" maxlength="200" value="${esc(listing.seo_title || "")}"></label>
          <label class="breit"><span>Kurzbeschreibung</span><textarea name="short_description" rows="3">${esc(listing.short_description || "")}</textarea></label>
          <label class="breit"><span>Beschreibung</span><textarea name="long_description" rows="8">${esc(htmlZuText(listing.long_description || ""))}</textarea></label>
          <label class="breit"><span>Stichpunkte (eine Zeile je Punkt)</span><textarea name="bullet_points" rows="5">${esc((listing.bullet_points || []).join("\n"))}</textarea></label>
          <label><span>Lieferumfang</span><input name="scope_of_delivery" value="${esc(listing.scope_of_delivery || "")}"></label>
          <label><span>Hinweis zum Zustand</span><input name="condition_note" value="${esc(listing.condition_note || "")}"></label>
          <label><span>Meta-Titel</span><input name="meta_title" maxlength="200" value="${esc(listing.meta_title || "")}"></label>
          <label><span>Adresse im Shop (Slug)</span><input name="url_slug" value="${esc(listing.url_slug || "")}"></label>
          <label class="breit"><span>Meta-Beschreibung (max. 320 Zeichen) <span class="muted" id="meta-zaehler"></span></span><textarea name="meta_description" rows="2" maxlength="320">${esc(listing.meta_description || "")}</textarea></label>
          <label class="breit"><span>Schlagwörter (mit Komma getrennt)</span><input name="tags" value="${esc((listing.tags || []).join(", "))}"></label>
          <div class="speicherleiste breit">
            ${darfShoptext ? '<button class="btn primary" type="submit">Shoptext speichern</button>' : '<span class="muted">Shoptexte ändern dürfen Shop-Manager, Lagerleiter und Administratoren.</span>'}
            ${darfShoptext ? '<button class="btn" type="button" id="shoptext-neu">Von der KI neu schreiben lassen</button>' : ""}
            <span id="shoptext-meldung"></span>
          </div>
        </form>`
      : `<p class="muted">Noch kein Shoptext vorhanden. Er entsteht automatisch nach der Erkennung.</p>
         ${darfShoptext ? '<button class="btn" type="button" id="shoptext-neu">Jetzt von der KI schreiben lassen</button> <span id="shoptext-meldung"></span>' : ""}`}
    </section>

    ${kiKostenArtikel(kiKosten)}

    <section class="card"><h3>Bestand</h3>
      <p>Bestand <strong>${product.stock_quantity}</strong> · reserviert ${product.reserved_quantity}
        · verfügbar <strong>${product.available_quantity}</strong></p>
      ${darfBestand ? `<form id="korrektur-form" class="toolbar korrektur">
          <strong style="width:100%">Bestand korrigieren</strong>
          <label>Tatsächlicher Bestand <input name="neu" type="number" min="${product.reserved_quantity}" step="1" required
            value="${product.stock_quantity}" style="width:120px"></label>
          <label style="flex:1">Begründung (Pflicht) <input name="reason" required minlength="3"
            placeholder="z. B. Inventur: 2 Stück fehlten, Karton beschädigt"></label>
          <button class="btn primary" type="submit">Korrigieren</button>
          <span id="korrektur-meldung"></span>
        </form>` : ""}
      ${darfBestand ? `<form id="bewegung-form" class="toolbar">
          <label>Vorgang <select name="movement_type">${Object.entries(BEWEGUNGEN).map(([v, l]) =>
            `<option value="${v}">${l}</option>`).join("")}</select></label>
          <label>Menge <input name="quantity_change" type="number" step="1" required placeholder="z. B. 5 oder -2" style="width:130px"></label>
          <label style="flex:1">Grund <input name="reason" placeholder="z. B. Nachlieferung (bei Korrektur/Ausschuss Pflicht)"></label>
          <button class="btn" type="submit">Buchen</button>
          <span id="bewegung-meldung"></span>
        </form>` : '<p class="muted">Bestand buchen dürfen Lagerleiter und Administratoren.</p>'}
      ${bewegungen.length ? `<div class="table-wrap"><table><thead><tr><th>Zeitpunkt</th><th>Vorgang</th>
        <th>Menge</th><th>Bestand</th><th>Grund</th></tr></thead><tbody>
        ${bewegungen.slice(0, 20).map((b) => `<tr><td>${fmtDate(b.created_at)}</td>
          <td>${esc(BEWEGUNGEN[b.movement_type] || b.movement_type)}</td>
          <td>${b.quantity_change > 0 ? "+" : ""}${b.quantity_change}</td>
          <td>${b.quantity_before} → ${b.quantity_after}</td><td class="muted">${esc(b.reason || "")}</td></tr>`).join("")}
        </tbody></table></div>` : ""}
    </section>

    ${darfBestand ? `<section class="card gefahr"><h3>Artikel löschen</h3>
      <p class="muted">Löscht den Artikel mit Bildern, Bestandshistorie und KI-Protokoll endgültig.
        Ein im Shop veröffentlichter Artikel muss vorher im Shop-Admin gelöscht oder ausgeblendet werden.</p>
      <button class="btn danger" type="button" id="artikel-loeschen">Artikel löschen …</button>
      <span id="loeschen-meldung"></span>
    </section>` : ""}`;

  const neuLaden = () => artikelDetail(productId);
  /** art: "ok" (gespeichert), "fehler" oder "info" (Hinweis, nichts passiert). */
  const melden = (id, text, art = "ok") => {
    const el = document.getElementById(id);
    const klasse = { ok: "ok", fehler: "error", info: "muted" }[art === true ? "fehler" : art];
    if (el) el.innerHTML = `<span class="${klasse}">${esc(text)}</span>`;
  };
  // Am Formular, nicht an main(): main() bleibt bestehen, das Formular entsteht
  // bei jedem Laden neu – sonst sammelten sich die Handler an.
  merkmaleAktivieren(document.getElementById("artikel-form"));

  // Stammdaten speichern: nur geänderte Felder, leere Felder werden geleert.
  document.getElementById("artikel-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const aenderungen = {};
    for (const [, felder] of ARTIKEL_GRUPPEN) {
      for (const [key, , art = "text"] of felder) {
        const neu = form.elements[key].value.trim();
        if (neu === feldWert(product, key, art)) continue;
        aenderungen[key] = neu === "" ? null
          : art === "lang" ? beschreibungSpeichern(neu, product[key]) : neu;
      }
    }
    for (const name of ["attributes", "technical_data"]) {
      const neu = merkmaleLesen(form.querySelector(`[data-merkmale="${name}"]`));
      if (JSON.stringify(neu) !== JSON.stringify(product[name] || {})) aenderungen[name] = neu;
    }
    if (Object.keys(aenderungen).length === 0) { melden("artikel-meldung", "Keine Änderungen.", "info"); return; }
    try {
      await api("/products/" + productId, { method: "PATCH", body: aenderungen });
      await neuLaden();
      melden("artikel-meldung", `✓ Gespeichert (${Object.keys(aenderungen).length} Angabe${Object.keys(aenderungen).length === 1 ? "" : "n"}).`);
    } catch (err) { melden("artikel-meldung", "Fehler: " + err.message, true); }
  };

  const empfehlung = document.getElementById("empfehlung");
  if (empfehlung) empfehlung.onclick = () => {
    document.querySelector('#artikel-form [name="sale_price"]').value =
      Number(product.recommended_sale_price).toFixed(2).replace(".", ",");
    melden("artikel-meldung", "Empfohlener Preis eingetragen – noch speichern.", "info");
  };

  // Offene Fragen beantworten
  const antworten = async (antwort) => {
    try {
      await api(`/captures/${productId}/answers`, { method: "POST", body: { answers: [antwort] } });
      await neuLaden();
    } catch (err) { alert("Antwort nicht gespeichert: " + err.message); }
  };
  main().querySelectorAll("[data-kandidat]").forEach((b) => b.onclick = () =>
    antworten({ question_id: b.dataset.frage, selected_candidate_index: Number(b.dataset.kandidat) }));
  main().querySelectorAll("[data-antwort]").forEach((b) => b.onclick = () =>
    antworten({ question_id: b.dataset.frage, field: b.dataset.feld || null, value: b.dataset.antwort }));
  main().querySelectorAll("[data-antwort-senden]").forEach((b) => b.onclick = () => {
    const wert = main().querySelector(`[data-antwort-eingabe="${b.dataset.antwortSenden}"]`).value.trim();
    if (!wert) return;
    antworten({ question_id: b.dataset.antwortSenden, field: b.dataset.feld || null, value: wert });
  });

  // Shoptext
  const shoptext = document.getElementById("shoptext-form");
  if (shoptext) {
    const zaehler = () => { document.getElementById("meta-zaehler").textContent =
      `(${shoptext.elements.meta_description.value.length}/320)`; };
    shoptext.elements.meta_description.oninput = zaehler; zaehler();
    shoptext.onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      const liste = (text, trenner) => text.split(trenner).map((x) => x.trim()).filter(Boolean);
      const body = {};
      for (const key of ["seo_title", "short_description", "long_description", "scope_of_delivery",
                         "condition_note", "meta_title", "meta_description", "url_slug"]) {
        const neu = f[key].value.trim();
        if (key === "long_description") {
          // Im Feld steht Text, gespeichert wird HTML für den Shop.
          if (neu !== htmlZuText(listing[key] || "")) body[key] = neu ? textZuHtml(neu) : null;
          continue;
        }
        if (neu !== (listing[key] || "")) body[key] = neu || null;
      }
      const punkte = liste(f.bullet_points.value, "\n");
      if (JSON.stringify(punkte) !== JSON.stringify(listing.bullet_points || [])) body.bullet_points = punkte;
      const tags = liste(f.tags.value, ",");
      if (JSON.stringify(tags) !== JSON.stringify(listing.tags || [])) body.tags = tags;
      if (Object.keys(body).length === 0) { melden("shoptext-meldung", "Keine Änderungen.", "info"); return; }
      try {
        await api(`/shop/products/${productId}/listing`, { method: "PATCH", body });
        await neuLaden();
        melden("shoptext-meldung", "✓ Shoptext gespeichert.");
      } catch (err) { melden("shoptext-meldung", "Fehler: " + err.message, true); }
    };
  }
  const kiFreigabe = document.getElementById("ki-budget-freigeben");
  if (kiFreigabe) kiFreigabe.onclick = async () => {
    if (!confirm("Für diesen Artikel weiteres KI-Budget freigeben? Die fehlenden KI-Schritte laufen dann weiter.")) return;
    kiFreigabe.disabled = true;
    try {
      await api(`/products/${productId}/ki-budget-freigeben`, { method: "POST" });
      melden("ki-budget-meldung", "✓ Freigegeben – die KI arbeitet weiter, in etwa einer Minute neu laden.");
    } catch (err) { kiFreigabe.disabled = false; melden("ki-budget-meldung", "Fehler: " + err.message, true); }
  };

  const shoptextNeu = document.getElementById("shoptext-neu");
  if (shoptextNeu) shoptextNeu.onclick = async () => {
    if (listing && !confirm("Shoptext neu schreiben lassen? Eigene Änderungen am Shoptext werden ersetzt.")) return;
    try {
      await api(`/shop/products/${productId}/listing/regenerate`, { method: "POST" });
      melden("shoptext-meldung", "✓ Wird neu geschrieben – in etwa einer Minute neu laden.");
    } catch (err) { melden("shoptext-meldung", "Fehler: " + err.message, true); }
  };

  // Bestand korrigieren: tatsächlicher Bestand statt Differenz, Begründung Pflicht
  const korrektur = document.getElementById("korrektur-form");
  if (korrektur) korrektur.onsubmit = async (e) => {
    e.preventDefault();
    const daten = Object.fromEntries(new FormData(e.target).entries());
    const neu = Number(daten.neu);
    const grund = (daten.reason || "").trim();
    if (!Number.isInteger(neu) || neu < 0) { melden("korrektur-meldung", "Bitte eine ganze Zahl ab 0 eingeben.", true); return; }
    if (grund.length < 3) { melden("korrektur-meldung", "Bitte eine Begründung für die Korrektur eingeben.", true); return; }
    const differenz = neu - product.stock_quantity;
    if (differenz === 0) { melden("korrektur-meldung", "Der Bestand ist bereits " + neu + ".", "info"); return; }
    if (!confirm(`Bestand von ${product.stock_quantity} auf ${neu} ändern (${differenz > 0 ? "+" : ""}${differenz})?\n\nBegründung: ${grund}`)) return;
    try {
      await api(`/products/${productId}/stock-movements`, { method: "POST", body: {
        movement_type: "manual_correction", quantity_change: differenz, reason: grund } });
      await neuLaden();
      melden("korrektur-meldung", "✓ Bestand korrigiert.");
    } catch (err) { melden("korrektur-meldung", "Fehler: " + err.message, true); }
  };

  // Artikel löschen: zweifache Bestätigung, die zweite mit der Artikelnummer
  const loeschen = document.getElementById("artikel-loeschen");
  if (loeschen) loeschen.onclick = async () => {
    const name = product.product_name || "Unbenannter Artikel";
    if (!confirm(`„${name}“ (${product.internal_sku}) wirklich endgültig löschen?\n\nBilder, Bestandshistorie und KI-Protokoll werden mit gelöscht.`)) return;
    const eingabe = prompt(`Zur zweiten Bestätigung bitte die Artikelnummer eingeben:\n${product.internal_sku}`);
    if (eingabe === null) return;
    if (eingabe.trim() !== product.internal_sku) { melden("loeschen-meldung", "Artikelnummer stimmt nicht – nichts gelöscht.", true); return; }
    try {
      await api(`/products/${productId}?bestaetigung=${encodeURIComponent(eingabe.trim())}`, { method: "DELETE" });
      location.hash = "#products";
    } catch (err) { melden("loeschen-meldung", "Fehler: " + err.message, true); }
  };

  // Lagerbewegung
  const bewegung = document.getElementById("bewegung-form");
  if (bewegung) bewegung.onsubmit = async (e) => {
    e.preventDefault();
    const daten = Object.fromEntries(new FormData(e.target).entries());
    const menge = Number(daten.quantity_change);
    if (!Number.isInteger(menge) || menge === 0) { melden("bewegung-meldung", "Menge muss eine ganze Zahl ungleich 0 sein.", true); return; }
    if (["manual_correction", "inventory_correction", "damaged"].includes(daten.movement_type)
        && (daten.reason || "").trim().length < 3) {
      melden("bewegung-meldung", "Bei Korrektur, Inventur und Ausschuss bitte eine Begründung angeben.", true); return;
    }
    try {
      await api(`/products/${productId}/stock-movements`, { method: "POST", body: {
        movement_type: daten.movement_type, quantity_change: menge, reason: daten.reason || null } });
      await neuLaden();
      melden("bewegung-meldung", "✓ Gebucht.");
    } catch (err) { melden("bewegung-meldung", "Fehler: " + err.message, true); }
  };
}

// ── Navigation & Auth-Flow ───────────────────────────────────────────────────

function showLogin() {
  clearTokens();
  const merken = document.getElementById("login-merken");
  if (merken) merken.checked = merkeAnmeldung();
  document.getElementById("app-view").hidden = true;
  document.getElementById("login-view").hidden = false;
}

async function showApp() {
  currentUser = await api("/auth/me");
  document.getElementById("login-view").hidden = true;
  document.getElementById("app-view").hidden = false;
  document.getElementById("user-info").textContent =
    `${currentUser.display_name} (${currentUser.role})`;
  navigate();
}

/** Zahl im Menüpunkt „Offene Aufgaben“ (0 = ausblenden). */
function aufgabenZahl(n) {
  const el = document.getElementById("aufgaben-zahl");
  if (!el) return;
  el.textContent = n;
  el.hidden = !n;
}

function navigate() {
  api("/products/aufgaben").then((d) => aufgabenZahl(d.artikel.length)).catch(() => {});
  // Routen haben die Form "#ansicht" oder "#ansicht/<id>" (z. B. #freigabe/<artikel-id>).
  const [route, param] = (location.hash || "#dashboard").slice(1).split("/", 2);
  const menue = route === "artikel" ? "products" : route;
  document.querySelectorAll("#nav a").forEach((a) =>
    a.classList.toggle("active", a.getAttribute("href") === "#" + menue));
  const view = views[route] || views.dashboard;
  main().innerHTML = '<p class="muted">Lade …</p>';
  view(param ? decodeURIComponent(param) : undefined).catch((err) => {
    main().innerHTML = `<p class="error">Fehler: ${esc(err.message)}</p>`;
  });
}

window.addEventListener("hashchange", navigate);

document.getElementById("login-form").onsubmit = async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("login-error");
  errorEl.hidden = true;
  try {
    const body = await api("/auth/login", { method: "POST", body: {
      email: document.getElementById("login-email").value,
      password: document.getElementById("login-password").value,
    } }, false);
    // Erst nach erfolgreicher Anmeldung festlegen, wo sie gespeichert wird.
    clearTokens();
    try {
      if (document.getElementById("login-merken").checked) localStorage.setItem(MERKEN, "1");
      else localStorage.removeItem(MERKEN);
    } catch (_) {}
    setTokens(body.access_token, body.refresh_token);
    await showApp();
  } catch (err) {
    errorEl.textContent = "Anmeldung fehlgeschlagen: " + err.message;
    errorEl.hidden = false;
  }
};

document.getElementById("logout-btn").onclick = async () => {
  try { await api("/auth/logout", { method: "POST",
    body: { refresh_token: refreshToken } }); } catch (_) {}
  showLogin();
};

(async function init() {
  if (accessToken) {
    try { await showApp(); return; } catch (_) {}
  }
  showLogin();
})();
