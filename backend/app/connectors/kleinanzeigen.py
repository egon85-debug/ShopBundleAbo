"""Kleinanzeigen – halbautomatisch, weil es für Waren keine Schnittstelle gibt.

Kleinanzeigen bietet Importschnittstellen nur für Immobilien (OpenImmo) an.
Programme, die die Webseite fernsteuern, verstoßen gegen die Nutzungsbedingungen
und riskieren eine Kontosperre. Deshalb bereitet das Lager die Anzeige vor
(Titel, Text, Preis, Fotos – siehe services/kanaele.py), ein Mensch stellt sie
ein und bestätigt das. Ist der Artikel ausverkauft, erinnert „Offene Aufgaben“
daran, die Anzeige zu löschen.
"""
from decimal import Decimal

from app.connectors.base import (
    ShopConnector,
    ShopConnectorError,
    ShopListingPayload,
    ShopPublishResult,
)

EINSTELLEN_URL = "https://www.kleinanzeigen.de/p-anzeige-aufgeben-schritt2.html"


class KleinanzeigenConnector(ShopConnector):
    connector_type = "kleinanzeigen"
    anzeige_name = "Kleinanzeigen"
    manuell = True
    standard_url = "https://www.kleinanzeigen.de"

    def test_connection(self) -> None:
        """Nichts zu prüfen – es gibt keine Verbindung, nur den Assistenten."""

    def publish_product(self, listing: ShopListingPayload) -> ShopPublishResult:
        raise ShopConnectorError("Kleinanzeigen wird von Hand eingestellt (Assistent im Lager-Web)")

    def update_product(self, external_id: str, listing: ShopListingPayload) -> None:
        """Änderungen trägt man bei Kleinanzeigen selbst ein."""

    def update_stock(self, external_id: str, quantity: int) -> None:
        """Bestand steuert handlers.handle_sync_stock über den Veröffentlichungsstatus."""

    def update_price(self, external_id: str, price: Decimal) -> None:
        """Preisänderungen trägt man bei Kleinanzeigen selbst ein."""

    def delist_product(self, external_id: str) -> None:
        """Löschen erledigt ein Mensch; die Aufgabe erscheint unter „Offene Aufgaben“."""

    def required_fields(self) -> list[str]:
        return ["product_name", "sale_price"]
