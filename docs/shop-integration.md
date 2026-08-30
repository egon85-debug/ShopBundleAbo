# Shop-Integrationskonzept

## Adapter-Architektur (Anforderung 16/34)

Die Kernlogik kennt ausschließlich das Interface `ShopConnector`
(`backend/app/connectors/base.py`):

```python
class ShopConnector(ABC):
    connector_type: str
    def test_connection(self) -> None: ...
    def publish_product(self, listing: ShopListingPayload) -> ShopPublishResult: ...
    def update_product(self, external_id: str, listing: ShopListingPayload) -> None: ...
    def update_stock(self, external_id: str, quantity: int) -> None: ...
    def update_price(self, external_id: str, price: Decimal) -> None: ...
    def delist_product(self, external_id: str) -> None: ...
```

Konnectoren registrieren sich in einer Registry (`connectors/registry.py`); eine
`shop_connections`-Zeile (Typ + Basis-URL + verschlüsselte Credentials) wird zur
Laufzeit in eine Connector-Instanz aufgelöst. Neue Systeme (Shopify, Shopware,
Magento, Marktplätze, individuelle REST-APIs) = neue Datei + Registry-Eintrag,
ohne Änderung an Services, Jobs oder UI.

## Referenz-Connector: WooCommerce

`connectors/woocommerce.py` nutzt die WooCommerce REST API v3
(Basic Auth mit Consumer Key/Secret über HTTPS):

- `POST /wp-json/wc/v3/products` — Anlage mit Titel, Beschreibungen, SKU, Preis
  (regular_price), Bestand (manage_stock + stock_quantity), Kategorien, Bildern
  (öffentliche URLs der optimierten Shopbilder), Attributen, Meta (Slug, Tags).
- `PUT /products/{id}` — Update, `stock_quantity`-Sync, Preisänderung.
- Delist = Status `draft`.

## Publikations-Workflow

1. `POST /products/{id}/publish` prüft zuerst die **Qualitätskontrolle**
   (Anforderung 30): Name, Preis, Bestand, Kategorie, Beschreibung, ≥1 Shopbild,
   Zustand, Pflichtfelder des Connectors. Fehlt etwas → 422 mit konkreter Liste,
   Status bleibt unverändert.
2. Bestanden → `shop_publications`-Eintrag (`pending`) + Job `publish_product`;
   Produkt-Status `publishing`.
3. Job ruft den Connector auf. Erfolg → `published` + `external_id` +
   `payload_snapshot` (exakt veröffentlichte Daten, Audit). Fehler → Retry mit
   Backoff; nach Ausschöpfung `publish_failed`, Produkt bleibt „Shopbereit“
   (Anforderung 31), Fehler sichtbar im Admin.
4. Bestellungen: Webhook `POST /shop/webhooks/{connection_id}/order`
   (HMAC-signiert) → Bestandsabbuchung als Movement `sale` mit Referenz auf die
   Bestellnummer.
