"""Connector für den eigenen Winterfeld-Shop (Next.js).

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


class WinterfeldShopConnector(ShopConnector):
    connector_type = "winterfeld"

    def _client(self) -> httpx.Client:
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            raise ShopConnectorError("Winterfeld-Shop: api_key fehlt in den Zugangsdaten")
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
                    raise ShopConnectorError("Winterfeld-Shop: Zugang verweigert (falscher API-Schlüssel)")
                if response.status_code == 503:
                    raise ShopConnectorError(
                        "Winterfeld-Shop: Schnittstelle nicht eingerichtet (INGEST_API_KEY fehlt)"
                    )
                if response.status_code == 422:
                    raise ShopConnectorError(f"Winterfeld-Shop lehnt die Daten ab: {response.text[:500]}")
                response.raise_for_status()
                return response.json() if response.content else {}
        except httpx.HTTPStatusError as exc:
            raise ShopConnectorError(
                f"Winterfeld-Shop POST {_INGEST_PFAD}: HTTP {exc.response.status_code} — "
                f"{exc.response.text[:500]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ShopConnectorError(f"Winterfeld-Shop nicht erreichbar: {exc}") from exc

    def test_connection(self) -> None:
        """Der Gesundheitsendpunkt sagt, ob Shop *und* Datenbank antworten."""
        try:
            with httpx.Client(base_url=self.base_url, timeout=30) as client:
                response = client.get("/api/health")
                response.raise_for_status()
                zustand = response.json()
        except httpx.HTTPError as exc:
            raise ShopConnectorError(f"Winterfeld-Shop nicht erreichbar: {exc}") from exc
        if zustand.get("status") != "ok":
            raise ShopConnectorError(
                f"Shop erreichbar, aber nicht betriebsbereit: {zustand.get('datenbank', {}).get('ursache')}"
            )
        # Der Schlüssel wird erst hier geprüft – ein Test ohne gültigen Zugang
        # wäre wertlos. Ein Artikel ohne SKU wird mit 422 abgelehnt, ein
        # falscher Schlüssel mit 401; nur Letzteres ist ein Fehler.
        api_key = self.credentials.get("api_key", "")
        if not api_key:
            raise ShopConnectorError("Winterfeld-Shop: api_key fehlt in den Zugangsdaten")
        with self._client() as client:
            probe = client.post(_INGEST_PFAD, json={})
        if probe.status_code == 401:
            raise ShopConnectorError("Winterfeld-Shop: API-Schlüssel wird abgelehnt")
        if probe.status_code == 503:
            raise ShopConnectorError(
                "Winterfeld-Shop: Schnittstelle nicht eingerichtet (INGEST_API_KEY fehlt)"
            )

    def _payload(self, listing: ShopListingPayload, aktiv: bool = True) -> dict:
        merkmale = {str(k): str(v) for k, v in listing.attributes.items()}
        if listing.bullet_points:
            for nummer, punkt in enumerate(listing.bullet_points, start=1):
                merkmale[f"Merkmal {nummer}"] = punkt

        payload: dict = {
            "sku": listing.sku,
            "name": listing.title,
            "kurzbeschreibung": listing.short_description,
            "beschreibung": listing.long_description,
            # Geld wandert als ganzzahliger Centbetrag – nie als Fliesskommazahl.
            "preisCents": int((listing.price * 100).to_integral_value()),
            "bestand": listing.stock_quantity,
            "zustand": listing.condition,
            "aktiv": aktiv,
            "merkmale": merkmale,
        }
        if listing.ean:
            payload["ean"] = listing.ean
        if listing.url_slug:
            payload["slug"] = listing.url_slug
        if listing.meta_title:
            payload["seoTitel"] = listing.meta_title
        if listing.meta_description:
            payload["seoBeschreibung"] = listing.meta_description
        if listing.category:
            payload["kategorien"] = [{"name": listing.category}]
        if listing.image_urls:
            payload["bilder"] = [{"url": url, "alt": listing.title} for url in listing.image_urls]
        return payload

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
