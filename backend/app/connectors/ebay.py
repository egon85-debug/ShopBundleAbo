"""eBay – über die offizielle Verkäuferschnittstelle (Sell Inventory API).

Ablauf beim Einstellen: Artikel (Inventory Item) anlegen → Angebot (Offer) mit
Kategorie, Preis und Geschäftsbedingungen anlegen → veröffentlichen. Die
Kategorie schlägt eBay anhand des Titels vor (Taxonomy API); ihre
Pflichtangaben („Marke“, „Herstellernummer“ …) kommen aus den erfassten Daten.
Was fehlt, meldet der Connector mit Namen – dann gehört es unter „Merkmale“.

Zugangsdaten je Verbindung (verschlüsselt): refresh_token aus der Anmeldung
bei eBay (services/ebay_konto.py), dazu IDs der Geschäftsbedingungen und des
Lagerorts, die bei „Verbindung testen“ ermittelt werden. Die App-Schlüssel
(Client-ID/-Secret) stehen nur in der Server-Umgebung, nie im Client.
"""
import base64
import html
import threading
import time
from decimal import Decimal

import httpx

from app.config import get_settings
from app.connectors.base import (
    ShopConnector,
    ShopConnectorError,
    ShopListingPayload,
    ShopPublishResult,
)

MARKTPLATZ = "EBAY_DE"
SPRACHE = "de-DE"
TITEL_MAX = 80
SCOPES = " ".join([
    "https://api.ebay.com/oauth/api_scope",
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
])
# Zustand im Lager → eBay-Zustand (ConditionEnum der Inventory API).
ZUSTAND = {
    "new": "NEW",
    "new_opened": "NEW_OTHER",
    "refurbished": "SELLER_REFURBISHED",
    "used": "USED_EXCELLENT",
    "defective": "FOR_PARTS_OR_NOT_WORKING",
}
# Übliche Ersatzwerte, wenn eBay eine Angabe verlangt, die es nicht gibt.
ERSATZ = {"Marke": "Markenlos", "Herstellernummer": "Nicht zutreffend"}

# Nur für Tests: nachgestellte Antworten statt echter Anfragen.
_transport: httpx.BaseTransport | None = None

_token_lock = threading.Lock()
_token_cache: dict[str, tuple[str, float]] = {}


def umgebung() -> dict:
    sandbox = get_settings().ebay_umgebung.strip().lower() == "sandbox"
    return {
        "api": "https://api.sandbox.ebay.com" if sandbox else "https://api.ebay.com",
        "auth": "https://auth.sandbox.ebay.com" if sandbox else "https://auth.ebay.com",
        "artikel": "https://sandbox.ebay.com/itm/" if sandbox else "https://www.ebay.de/itm/",
    }


def app_konfiguriert() -> bool:
    s = get_settings()
    return bool(s.ebay_client_id and s.ebay_client_secret and s.ebay_runame)


def _client() -> httpx.Client:
    return httpx.Client(timeout=40.0, transport=_transport)


def _basic() -> str:
    s = get_settings()
    return "Basic " + base64.b64encode(f"{s.ebay_client_id}:{s.ebay_client_secret}".encode()).decode()


def token_holen(daten: dict) -> dict:
    """POST /identity/v1/oauth2/token – Code tauschen, Token erneuern oder App-Token."""
    with _client() as client:
        antwort = client.post(umgebung()["api"] + "/identity/v1/oauth2/token", data=daten,
                              headers={"Authorization": _basic(),
                                       "Content-Type": "application/x-www-form-urlencoded"})
    if antwort.status_code != 200:
        raise ShopConnectorError(f"eBay-Anmeldung abgelehnt: {_fehlertext(antwort)}")
    return antwort.json()


def _zugriff(schluessel: str, daten: dict) -> str:
    """Zugriffstoken aus dem Zwischenspeicher oder neu (gilt ca. 2 Stunden)."""
    with _token_lock:
        token, ablauf = _token_cache.get(schluessel, ("", 0.0))
        if token and ablauf - 120 > time.time():
            return token
    antwort = token_holen(daten)
    with _token_lock:
        _token_cache[schluessel] = (antwort["access_token"],
                                    time.time() + int(antwort.get("expires_in", 7200)))
    return antwort["access_token"]


def _fehlertext(antwort: httpx.Response) -> str:
    try:
        daten = antwort.json()
    except ValueError:
        return f"HTTP {antwort.status_code}"
    fehler = daten.get("errors") or daten.get("warnings") or []
    if fehler:
        return "; ".join(f"{f.get('message', '')} ({f.get('errorId', '')})" for f in fehler[:3])
    return daten.get("error_description") or daten.get("error") or f"HTTP {antwort.status_code}"


class EbayConnector(ShopConnector):
    connector_type = "ebay"
    anzeige_name = "eBay"
    standard_url = "https://www.ebay.de"
    # Adresse des Lagers – eBay verlangt einen Artikelstandort.
    zugangsfelder = (("plz", "PLZ des Lagers", False), ("ort", "Ort des Lagers", False))

    def __init__(self, base_url: str, credentials: dict) -> None:
        super().__init__(base_url or "https://www.ebay.de", credentials)

    # ── Grundlagen ────────────────────────────────────────────────────────

    def _nutzer_token(self) -> str:
        refresh = self.credentials.get("refresh_token")
        if not refresh:
            raise ShopConnectorError("eBay ist noch nicht verbunden (im Lager-Web „Mit eBay verbinden“)")
        return _zugriff("nutzer:" + refresh, {"grant_type": "refresh_token",
                                              "refresh_token": refresh, "scope": SCOPES})

    def _app_token(self) -> str:
        return _zugriff("app", {"grant_type": "client_credentials",
                                "scope": "https://api.ebay.com/oauth/api_scope"})

    def _anfrage(self, methode: str, pfad: str, *, app: bool = False, json: dict | None = None,
                 params: dict | None = None, erlaubt: tuple[int, ...] = ()) -> dict:
        token = self._app_token() if app else self._nutzer_token()
        kopf = {"Authorization": f"Bearer {token}", "Accept": "application/json",
                "Content-Language": SPRACHE, "Accept-Language": SPRACHE,
                "X-EBAY-C-MARKETPLACE-ID": MARKTPLATZ}
        try:
            with _client() as client:
                antwort = client.request(methode, umgebung()["api"] + pfad, json=json,
                                         params=params, headers=kopf)
        except httpx.HTTPError as exc:
            raise ShopConnectorError(f"eBay nicht erreichbar: {exc}") from exc
        if antwort.status_code in erlaubt:
            return {"_status": antwort.status_code}
        if antwort.status_code >= 400:
            raise ShopConnectorError(f"eBay {methode} {pfad.split('?')[0]}: {_fehlertext(antwort)}")
        return antwort.json() if antwort.content else {}

    # ── Einrichtung (Verbindung testen) ────────────────────────────────────

    def einrichtung(self) -> dict:
        """Geschäftsbedingungen und Lagerort ermitteln bzw. anlegen.
        Liefert die Werte, die in den Zugangsdaten gespeichert werden."""
        ergebnis = {}
        for art, schluessel in (("fulfillment_policy", "fulfillment_policy_id"),
                                ("payment_policy", "payment_policy_id"),
                                ("return_policy", "return_policy_id")):
            if self.credentials.get(schluessel):
                ergebnis[schluessel] = self.credentials[schluessel]
                continue
            daten = self._anfrage("GET", f"/sell/account/v1/{art}", params={"marketplace_id": MARKTPLATZ})
            liste = daten.get(_POLICY_LISTE[art]) or []
            if not liste:
                raise ShopConnectorError(
                    f"Im eBay-Konto fehlen {_POLICY_NAME[art]} für ebay.de – bitte in „Mein eBay → "
                    "Verkaufen → Geschäftsbedingungen“ anlegen (Versand, Zahlung, Rücknahme).")
            ergebnis[schluessel] = liste[0][_POLICY_ID[art]]

        standort = self.credentials.get("merchant_location_key") or "lager-1"
        vorhanden = self._anfrage("GET", f"/sell/inventory/v1/location/{standort}", erlaubt=(404,))
        if vorhanden.get("_status") == 404:
            plz, ort = self.credentials.get("plz"), self.credentials.get("ort")
            if not (plz and ort):
                raise ShopConnectorError("Für eBay werden PLZ und Ort des Lagers gebraucht (Verbindung bearbeiten)")
            self._anfrage("POST", f"/sell/inventory/v1/location/{standort}", json={
                "location": {"address": {"postalCode": str(plz), "city": str(ort),
                                         "country": self.credentials.get("land", "DE")}},
                "locationTypes": ["WAREHOUSE"], "name": "Lager",
                "merchantLocationStatus": "ENABLED"}, erlaubt=(204,))
        ergebnis["merchant_location_key"] = standort
        return ergebnis

    def test_connection(self) -> None:
        self.einrichtung()

    # ── Kategorie und Pflichtangaben ───────────────────────────────────────

    def _baum_id(self) -> str:
        if not getattr(self, "_baum", None):
            self._baum = self._anfrage("GET", "/commerce/taxonomy/v1/get_default_category_tree_id",
                                       app=True, params={"marketplace_id": MARKTPLATZ})["categoryTreeId"]
        return self._baum

    def kategorie(self, listing: ShopListingPayload) -> tuple[str, str]:
        """Die von eBay vorgeschlagene Kategorie für Titel und Lager-Kategorie."""
        frage = " ".join(filter(None, [listing.title, listing.category]))[:350]
        vorschlaege = self._anfrage(
            "GET", f"/commerce/taxonomy/v1/category_tree/{self._baum_id()}/get_category_suggestions",
            app=True, params={"q": frage}).get("categorySuggestions") or []
        if not vorschlaege:
            raise ShopConnectorError(f"eBay findet keine Kategorie für „{frage[:60]}“")
        kat = vorschlaege[0]["category"]
        return kat["categoryId"], kat.get("categoryName", "")

    def merkmale(self, listing: ShopListingPayload, kategorie_id: str, kategorie_name: str) -> dict:
        """Pflicht- und passende Angaben der Kategorie aus den erfassten Daten."""
        daten = self._anfrage(
            "GET", f"/commerce/taxonomy/v1/category_tree/{self._baum_id()}/get_item_aspects_for_category",
            app=True, params={"category_id": kategorie_id})
        bekannt = {k.casefold(): str(v) for k, v in {**listing.technical_data, **listing.attributes}.items()
                   if v not in (None, "")}
        bekannt.setdefault("marke", listing.brand or listing.manufacturer or "")
        bekannt.setdefault("hersteller", listing.manufacturer or "")
        bekannt.setdefault("herstellernummer", listing.mpn or "")
        bekannt.setdefault("modell", listing.model or "")
        bekannt.setdefault("ean", listing.ean or "")

        ergebnis, fehlt = {}, []
        for aspekt in daten.get("aspects") or []:
            name = aspekt.get("localizedAspectName", "")
            regel = aspekt.get("aspectConstraint") or {}
            pflicht = bool(regel.get("aspectRequired"))
            erlaubt = [w.get("localizedValue", "") for w in aspekt.get("aspectValues") or []]
            wert = bekannt.get(name.casefold(), "")
            if wert and regel.get("aspectMode") == "SELECTION_ONLY":
                treffer = [w for w in erlaubt if w.casefold() == wert.casefold()]
                wert = treffer[0] if treffer else ""
            if not wert and pflicht and name in ERSATZ:
                wert = ERSATZ[name]
            if wert:
                ergebnis[name] = [wert[:65]]
            elif pflicht:
                fehlt.append(name)
        if fehlt:
            raise ShopConnectorError(
                f"eBay verlangt in der Kategorie „{kategorie_name}“ noch: {', '.join(fehlt)} – "
                "bitte im Lager-Web unter „Merkmale“ ergänzen und erneut veröffentlichen.")
        return ergebnis

    # ── Einstellen und pflegen ─────────────────────────────────────────────

    @staticmethod
    def _beschreibung(listing: ShopListingPayload) -> str:
        text = listing.long_description or listing.short_description or listing.title
        if "<" not in text:
            text = "".join(f"<p>{html.escape(a)}</p>" for a in text.split("\n\n") if a.strip())
        if listing.bullet_points:
            text += "<ul>" + "".join(f"<li>{html.escape(p)}</li>" for p in listing.bullet_points) + "</ul>"
        return text

    def _artikel(self, listing: ShopListingPayload, merkmale: dict) -> dict:
        bilder = [u for u in listing.image_urls if u.startswith("https://")][:24]
        if not bilder:
            raise ShopConnectorError("eBay braucht mindestens ein Bild mit https-Adresse (DOMAIN in der .env setzen)")
        produkt = {"title": listing.title[:TITEL_MAX], "description": self._beschreibung(listing)[:4000],
                   "aspects": merkmale, "imageUrls": bilder}
        if listing.ean:
            produkt["ean"] = [listing.ean]
        if listing.mpn:
            produkt["mpn"] = listing.mpn
        if listing.brand or listing.manufacturer:
            produkt["brand"] = listing.brand or listing.manufacturer
        return {"product": produkt,
                "condition": ZUSTAND.get(listing.condition, "NEW"),
                "availability": {"shipToLocationAvailability": {"quantity": max(listing.stock_quantity, 0)}}}

    def _angebot(self, listing: ShopListingPayload, kategorie_id: str) -> dict:
        c = self.credentials
        return {
            "sku": listing.sku, "marketplaceId": MARKTPLATZ, "format": "FIXED_PRICE",
            "availableQuantity": max(listing.stock_quantity, 0), "categoryId": kategorie_id,
            "listingDescription": self._beschreibung(listing),
            "listingPolicies": {"fulfillmentPolicyId": c.get("fulfillment_policy_id"),
                                "paymentPolicyId": c.get("payment_policy_id"),
                                "returnPolicyId": c.get("return_policy_id")},
            "pricingSummary": {"price": {"value": f"{listing.price:.2f}", "currency": "EUR"}},
            "merchantLocationKey": c.get("merchant_location_key", "lager-1"),
        }

    def _bereit(self) -> None:
        if not all(self.credentials.get(k) for k in ("fulfillment_policy_id", "payment_policy_id",
                                                     "return_policy_id")):
            self.credentials.update(self.einrichtung())

    def publish_product(self, listing: ShopListingPayload) -> ShopPublishResult:
        self._bereit()
        kategorie_id, kategorie_name = self.kategorie(listing)
        merkmale = self.merkmale(listing, kategorie_id, kategorie_name)
        self._anfrage("PUT", f"/sell/inventory/v1/inventory_item/{listing.sku}",
                      json=self._artikel(listing, merkmale), erlaubt=(204,))
        vorhanden = self._anfrage("GET", "/sell/inventory/v1/offer",
                                  params={"sku": listing.sku, "marketplace_id": MARKTPLATZ},
                                  erlaubt=(404,)).get("offers") or []
        if vorhanden:
            angebot_id = vorhanden[0]["offerId"]
            self._anfrage("PUT", f"/sell/inventory/v1/offer/{angebot_id}",
                          json=self._angebot(listing, kategorie_id), erlaubt=(204,))
        else:
            angebot_id = self._anfrage("POST", "/sell/inventory/v1/offer",
                                       json=self._angebot(listing, kategorie_id))["offerId"]
        listing_id = self._anfrage("POST", f"/sell/inventory/v1/offer/{angebot_id}/publish")["listingId"]
        return ShopPublishResult(external_id=angebot_id, external_url=umgebung()["artikel"] + listing_id)

    def update_product(self, external_id: str, listing: ShopListingPayload) -> None:
        self._bereit()
        angebot = self._anfrage("GET", f"/sell/inventory/v1/offer/{external_id}")
        # Die Kategorie bleibt, wie sie beim Einstellen gewählt wurde.
        kategorie_id = angebot.get("categoryId")
        kategorie_name = kategorie_id or ""
        if not kategorie_id:
            kategorie_id, kategorie_name = self.kategorie(listing)
        merkmale = self.merkmale(listing, kategorie_id, kategorie_name)
        self._anfrage("PUT", f"/sell/inventory/v1/inventory_item/{listing.sku}",
                      json=self._artikel(listing, merkmale), erlaubt=(204,))
        self._anfrage("PUT", f"/sell/inventory/v1/offer/{external_id}",
                      json=self._angebot(listing, kategorie_id), erlaubt=(204,))

    def _preis_menge(self, external_id: str, *, menge: int | None = None,
                     preis: Decimal | None = None) -> None:
        sku = self._anfrage("GET", f"/sell/inventory/v1/offer/{external_id}")["sku"]
        angebot: dict = {"offerId": external_id}
        eintrag: dict = {"sku": sku, "offers": [angebot]}
        if menge is not None:
            angebot["availableQuantity"] = max(menge, 0)
            eintrag["shipToLocationAvailability"] = {"quantity": max(menge, 0)}
        if preis is not None:
            angebot["price"] = {"value": f"{preis:.2f}", "currency": "EUR"}
        antwort = self._anfrage("POST", "/sell/inventory/v1/bulk_update_price_quantity",
                                json={"requests": [eintrag]})
        for r in antwort.get("responses") or []:
            if int(r.get("statusCode", 200)) >= 400:
                raise ShopConnectorError(f"eBay Bestand/Preis: {r.get('errors') or r}")

    def update_stock(self, external_id: str, quantity: int) -> None:
        self._preis_menge(external_id, menge=quantity)

    def update_price(self, external_id: str, price: Decimal) -> None:
        self._preis_menge(external_id, preis=price)

    def delist_product(self, external_id: str) -> None:
        self._anfrage("POST", f"/sell/inventory/v1/offer/{external_id}/withdraw")

    def required_fields(self) -> list[str]:
        return ["product_name", "sale_price"]

    # ── Verkäufe ────────────────────────────────────────────────────────────

    def bestellungen_seit(self, seit_iso: str) -> list[dict]:
        """Bestellungen ab einem Zeitpunkt (ISO, UTC), vereinfacht für das Lager."""
        ergebnis, offset = [], 0
        while True:
            daten = self._anfrage("GET", "/sell/fulfillment/v1/order", params={
                "filter": f"creationdate:[{seit_iso}..]", "limit": 50, "offset": offset})
            for o in daten.get("orders") or []:
                versand = ((o.get("fulfillmentStartInstructions") or [{}])[0]
                           .get("shippingStep") or {}).get("shipTo") or {}
                ergebnis.append({
                    "bestellnummer": o["orderId"],
                    "erstellt": o.get("creationDate"),
                    "bezahlt": o.get("orderPaymentStatus") in ("PAID", "PARTIALLY_REFUNDED"),
                    "storniert": (o.get("cancelStatus") or {}).get("cancelState") == "CANCELED",
                    "summe": (o.get("pricingSummary") or {}).get("total", {}).get("value"),
                    "kaeufer": o.get("buyer", {}).get("username"),
                    "lieferadresse": {
                        "name": versand.get("fullName"),
                        "strasse": (versand.get("contactAddress") or {}).get("addressLine1"),
                        "zusatz": (versand.get("contactAddress") or {}).get("addressLine2"),
                        "plz": (versand.get("contactAddress") or {}).get("postalCode"),
                        "ort": (versand.get("contactAddress") or {}).get("city"),
                        "land": (versand.get("contactAddress") or {}).get("countryCode"),
                        "telefon": (versand.get("primaryPhone") or {}).get("phoneNumber"),
                        "email": versand.get("email"),
                    },
                    "positionen": [{"position": li.get("lineItemId"), "sku": li.get("sku"),
                                    "titel": li.get("title"), "menge": int(li.get("quantity", 0)),
                                    "preis": (li.get("lineItemCost") or {}).get("value")}
                                   for li in o.get("lineItems") or []],
                })
            gesamt = int(daten.get("total", 0))
            offset += 50
            if offset >= gesamt or not daten.get("orders"):
                return ergebnis

    def versand_melden(self, bestellnummer: str, positionen: list[str], sendungsnummer: str,
                       versender: str = "DHL") -> None:
        from datetime import datetime, timezone
        self._anfrage("POST", f"/sell/fulfillment/v1/order/{bestellnummer}/shipping_fulfillment", json={
            "lineItems": [{"lineItemId": p} for p in positionen],
            "shippedDate": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "shippingCarrierCode": versender, "trackingNumber": sendungsnummer})


_POLICY_LISTE = {"fulfillment_policy": "fulfillmentPolicies", "payment_policy": "paymentPolicies",
                 "return_policy": "returnPolicies"}
_POLICY_ID = {"fulfillment_policy": "fulfillmentPolicyId", "payment_policy": "paymentPolicyId",
              "return_policy": "returnPolicyId"}
_POLICY_NAME = {"fulfillment_policy": "Versandbedingungen", "payment_policy": "Zahlungsbedingungen",
                "return_policy": "Rücknahmebedingungen"}
