/* Winterfeld Logistik – Admin-SPA. Nutzt ausschließlich die abgesicherte REST-API. */
"use strict";

const API = "/api/v1";
let accessToken = sessionStorage.getItem("wf_access") || null;
let refreshToken = sessionStorage.getItem("wf_refresh") || null;
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
    try { detail = JSON.stringify((await res.json()).detail); } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function tryRefresh() {
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
  sessionStorage.setItem("wf_access", access);
  sessionStorage.setItem("wf_refresh", refresh);
}

function clearTokens() {
  accessToken = refreshToken = null;
  sessionStorage.removeItem("wf_access");
  sessionStorage.removeItem("wf_refresh");
}

// ── Views ────────────────────────────────────────────────────────────────────

const main = () => document.getElementById("main");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function statusBadge(status) {
  const ok = ["published", "done", "shop_ready", "ok", "ready"];
  const err = ["dead", "error", "failed", "publish_failed"];
  const cls = ok.includes(status) ? "ok" : err.includes(status) ? "err" : "warn";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

const fmtDate = (s) => (s ? new Date(s).toLocaleString("de-DE") : "–");
const fmtMoney = (v) => (v == null ? "–" : Number(v).toLocaleString("de-DE",
  { style: "currency", currency: "EUR" }));

const views = {
  async dashboard() {
    const d = await api("/dashboard");
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
          endgültig fehlgeschlagene Jobs</span> – siehe <a href="#jobs">Jobs &amp; Fehler</a></div>` : ""}`;
  },

  async products() {
    const page = await api("/products?limit=100");
    main().innerHTML = `
      <h2>Artikel (${page.total})</h2>
      <div class="toolbar"><label>Suche <input id="prod-search" placeholder="Name, SKU, EAN …"></label>
        <button class="btn" id="prod-search-btn">Suchen</button></div>
      <div class="table-wrap" id="prod-table"></div>`;
    const render = (items) => {
      document.getElementById("prod-table").innerHTML = `<table><thead><tr>
        <th>SKU</th><th>Name</th><th>EAN</th><th>Bestand</th><th>VK</th>
        <th>Status</th><th>Shop</th><th>Lagerplatz</th></tr></thead><tbody>
        ${items.map((p) => `<tr><td>${esc(p.internal_sku)}</td>
          <td>${esc(p.product_name || "–")}<br><span class="muted">${esc(p.manufacturer || "")}</span></td>
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

  async jobs() {
    const jobs = await api("/jobs");
    main().innerHTML = `
      <h2>Jobs &amp; Synchronisationsfehler</h2>
      <div class="table-wrap"><table><thead><tr><th>Typ</th><th>Status</th>
        <th>Versuche</th><th>Nächster Lauf</th><th>Letzter Fehler</th><th></th></tr>
      </thead><tbody>
        ${jobs.map((j) => `<tr><td>${esc(j.job_type)}</td><td>${statusBadge(j.status)}</td>
          <td>${j.attempts}/${j.max_attempts}</td><td>${fmtDate(j.run_at)}</td>
          <td class="muted">${esc((j.last_error || "").slice(0, 160))}</td>
          <td>${["dead", "failed"].includes(j.status)
            ? `<button class="btn small" data-retry="${j.id}">Erneut versuchen</button>` : ""}</td>
          </tr>`).join("")}
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

// ── Navigation & Auth-Flow ───────────────────────────────────────────────────

function showLogin() {
  clearTokens();
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

function navigate() {
  const route = (location.hash || "#dashboard").slice(1);
  document.querySelectorAll("#nav a").forEach((a) =>
    a.classList.toggle("active", a.getAttribute("href") === "#" + route));
  const view = views[route] || views.dashboard;
  main().innerHTML = '<p class="muted">Lade …</p>';
  view().catch((err) => {
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
