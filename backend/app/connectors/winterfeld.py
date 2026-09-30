"""Connector für den eigenen Winterfeldt-Shop (Next.js).

Der Shop nimmt Artikel über einen einzigen Endpunkt entgegen, der anlegt oder
aktualisiert – Schlüssel ist die SKU. Dadurch ist ein wiederholter Versuch nach
einem Netzwerkfehler gefahrlos: derselbe Artikel zweimal geschickt ergibt
denselben Datensatz, nicht zwei.

Der Zugang läuft über einen eigenen Maschinenschlüssel (Kopfzeile `x-api-key`),
nicht über den Admin-Login des Shops. Der Schlüssel liegt verschlüsselt in der
Shop-Verbindung und erscheint nirgends im Quelltext.
"""
from decimal import Decimal

import httpx

from app.connectors.base import (
    ShopConnector,
    ShopConnectorError,
    ShopListingPayload,
    ShopPublishResult,
)

_INGEST_PFAD = "/api/ingest/produkt"

# Obergrenzen des Prüfschemas im Shop (shop/src/services/ingest.ts). Ein Feld
# darüber lässt den ganzen Artikel mit 422 scheitern – und die Veröffentlichung
# hinge in Wiederholungen. KI-Texte werden deshalb hier gekürzt.
_GRENZEN = {"name": 300, "kurzbeschreibung": 2000, "slug": 320, "seoTitel": 200,
            "seoBeschreibung": 320, "zustand": 60, "kategorie": 160, "alt": 300}


# Einheit der Füllmenge → Basiseinheit im Shop und Umrechnungsfaktor.
_FAKTOR = {"ml": ("ml", 1), "l": ("ml", 1000), "g": ("g", 1), "kg": ("g", 1000)}


def _kuerzen(text: str | None, grenze: int) -> str | None:
    """Auf `grenze` Zeichen kürzen, möglichst an einer Wortgrenze, mit „…“."""
    if text is None or len(text) <= grenze:
        return text
    schnitt = text[: grenze - 1]
    if " " in schnitt[grenze // 2:]:
        schnitt = schnitt[: schnitt.rfind(" ")]
    return schnitt.rstrip(" ,.;:-") + "…"


class WinterfeldShopConnector(ShopConnector):
    connector_type = "winterfeld"
    anzeige_name = "Eigener Shop"

    def _client(self) -> httpx.Client:
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            raise ShopConnectorError("Winterfeldt-Shop: api_key fehlt in den Zugangsdaten")
        return httpx.Client(
            base_url=self.base_url,
            headers={"x-api-key": api_key, "content-type": "application/json"},
            timeout=60,
        )

    def _post(self, payload: dict) -> dict:
        try:
            with self._client() as client:
                response = client.post(_INGEST_PFAD, json=payload)
                if response.status_code == 401:
                    raise ShopConnectorError("Winterfeldt-Shop: Zugang verweigert (falscher API-Schlüssel)")
                if response.status_code == 503:
                    raise ShopConnectorError(
                        "Winterfeldt-Shop: Schnittstelle nicht eingerichtet (INGEST_API_KEY fehlt)"
                    )
                if response.status_code == 422:
                    raise ShopConnectorError(f"Winterfeldt-Shop lehnt die Daten ab: {response.text[:500]}")
                response.raise_for_status()
                return response.json() if response.content else {}
        except httpx.HTTPStatusError as exc:
            raise ShopConnectorError(
                f"Winterfeldt-Shop POST {_INGEST_PFAD}: HTTP {exc.response.status_code} — "
                f"{exc.response.text[:500]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ShopConnectorError(f"Winterfeldt-Shop nicht erreichbar: {exc}") from exc

    def test_connection(self) -> None:
        """Der Gesundheitsendpunkt sagt, ob Shop *und* Datenbank antworten."""
        try:
            with httpx.Client(base_url=self.base_url, timeout=30) as client:
                response = client.get("/api/health")
                response.raise_for_status()
                zustand = response.json()
        except httpx.HTTPError as exc:
            raise ShopConnectorError(f"Winterfeldt-Shop nicht erreichbar: {exc}") from exc
        if zustand.get("status") != "ok":
            raise ShopConnectorError(
                f"Shop erreichbar, aber nicht betriebsbereit: {zustand.get('datenbank', {}).get('ursache')}"
            )
        # Der Schlüssel wird erst hier geprüft – ein Test ohne gültigen Zugang
        # wäre wertlos. Ein Artikel ohne SKU wird mit 422 abgelehnt, ein
        # falscher Schlüssel mit 401; nur Letzteres ist ein Fehler.
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            raise ShopConnectorError("Winterfeldt-Shop: api_key fehlt in den Zugangsdaten")
        with self._client() as client:
            probe = client.post(_INGEST_PFAD, json={})
        if probe.status_code == 401:
            raise ShopConnectorError("Winterfeldt-Shop: API-Schlüssel wird abgelehnt")
        if probe.status_code == 503:
            raise ShopConnectorError(
                "Winterfeldt-Shop: Schnittstelle nicht eingerichtet (INGEST_API_KEY fehlt)"
            )

    def _payload(self, listing: ShopListingPayload, aktiv: bool = True) -> dict:
        merkmale = {str(k): str(v) for k, v in listing.attributes.items()}
        if listing.bullet_points:
            for nummer, punkt in enumerate(listing.bullet_points, start=1):
                merkmale[f"Merkmal {nummer}"] = punkt

        payload: dict = {
            "sku": listing.sku,
            "name": _kuerzen(listing.title, _GRENZEN["name"]),
            "kurzbeschreibung": _kuerzen(listing.short_description, _GRENZEN["kurzbeschreibung"]),
            "beschreibung": listing.long_description,
            # Geld wandert als ganzzahliger Centbetrag – nie als Fliesskommazahl.
            "preisCents": int((listing.price * 100).to_integral_value()),
            "bestand": listing.stock_quantity,
            "zustand": _kuerzen(listing.condition, _GRENZEN["zustand"]),
            "aktiv": aktiv,
            "merkmale": merkmale,
        }
        ean = "".join(z for z in (listing.ean or "") if z.isdigit())
        if 8 <= len(ean) <= 14:  # sonst lieber weglassen als den Artikel scheitern lassen
            payload["ean"] = ean
        if listing.url_slug:
            payload["slug"] = _kuerzen(listing.url_slug, _GRENZEN["slug"]).rstrip("…")
        if listing.meta_title:
            payload["seoTitel"] = _kuerzen(listing.meta_title, _GRENZEN["seoTitel"])
        if listing.meta_description:
            payload["seoBeschreibung"] = _kuerzen(listing.meta_description, _GRENZEN["seoBeschreibung"])
        if listing.category:
            payload["kategorien"] = [{"name": _kuerzen(listing.category, _GRENZEN["kategorie"])}]
        if listing.image_urls:
            alt = _kuerzen(listing.title, _GRENZEN["alt"])
            payload["bilder"] = [{"url": url, "alt": alt} for url in listing.image_urls]
        payload.update(self._lebensmittel(listing))
        return payload

    @staticmethod
    def _lebensmittel(listing: ShopListingPayload) -> dict:
        """Füllmenge (für den Grundpreis), Pfand und Kennzeichnung.

        Die Menge geht in ganzen Millilitern bzw. Gramm an den Shop – so rechnet
        er den Grundpreis ohne Fliesskommazahlen. Fehlende Angaben gehen
        ausdrücklich als leer (null/0) mit: Das Lager ist die Quelle, eine hier
        gelöschte Angabe soll auch im Shop verschwinden.
        """
        inhalt = None
        if listing.net_content_amount and listing.net_content_unit in _FAKTOR:
            einheit, faktor = _FAKTOR[listing.net_content_unit]
            menge = int((listing.net_content_amount * faktor).to_integral_value())
            if menge > 0:
                inhalt = {"menge": menge, "einheit": einheit, "anzahl": listing.units_per_pack or 1}
        pfand = listing.deposit_amount if listing.deposit_amount and listing.deposit_amount > 0 else None
        text = lambda wert: wert.strip() if wert and wert.strip() else None  # noqa: E731
        return {
            "inhalt": inhalt,
            "pfandCents": int((pfand * 100).to_integral_value()) if pfand else 0,
            "pfandArt": listing.deposit_type if pfand else None,
            "zutaten": text(listing.ingredients),
            "allergene": text(listing.allergens),
            "lebensmittelHinweise": text(listing.food_notes),
        }

    def publish_product(self, listing: ShopListingPayload) -> ShopPublishResult:
        daten = self._post(self._payload(listing))
        return ShopPublishResult(external_id=str(daten["id"]), external_url=daten.get("url"))

    def update_product(self, external_id: str, listing: ShopListingPayload) -> None:
        self._post({"id": external_id, **self._payload(listing)})

    def update_stock(self, external_id: str, quantity: int) -> None:
        self._post({"id": external_id, "bestand": quantity})

    def update_price(self, external_id: str, price: Decimal) -> None:
        self._post({"id": external_id, "preisCents": int((price * 100).to_integral_value())})

    def delist_product(self, external_id: str) -> None:
        """Artikel bleibt mit seiner Historie erhalten, wird aber nicht mehr angezeigt."""
        self._post({"id": external_id, "aktiv": False})

    def required_fields(self) -> list[str]:
        return ["product_name", "sale_price", "category"]
