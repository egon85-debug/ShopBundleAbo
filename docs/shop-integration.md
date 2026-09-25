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

## Connector „winterfeld" — der eigene Shop

`connectors/winterfeld.py` spricht mit dem Next.js-Shop in diesem Repository
(Verzeichnis `shop/`). Der Shop nimmt Artikel über **einen** Endpunkt entgegen,
der anlegt oder aktualisiert:

```
POST /api/ingest/produkt
x-api-key: <INGEST_API_KEY>
```

Schlüssel ist die **SKU** (bei bereits übernommenen Artikeln alternativ die vom
Shop vergebene `id`). Derselbe Artikel zweimal geschickt ergibt denselben
Datensatz, nicht zwei — ein Wiederholungsversuch nach einem Netzwerkfehler ist
damit gefahrlos.

### Zugang

Ein eigener Maschinenschlüssel, **nicht** der Admin-Login des Shops: ein
Maschinenzugang bekommt so nie Sitzungsrechte im Backoffice.

- Im Shop: Umgebungsvariable `INGEST_API_KEY`, mindestens 32 Zeichen
  (`openssl rand -hex 32`). Ist sie nicht gesetzt, antwortet der Endpunkt mit
  `503` — ein fehlendes Geheimnis führt nie zu offenem Zugang.
- Im Lager-Backend: als Zugangsdaten der Shop-Verbindung
  (`{"api_key": "…"}`), verschlüsselt in `shop_connections.credentials_encrypted`.
  Der Schlüssel steht in keiner Quelldatei.

### Feldabbildung

| Lager | Shop | Anmerkung |
|---|---|---|
| `sku` | `sku` | fachlicher Schlüssel, eindeutig |
| `price` | `preisCents` | ganzzahliger Centbetrag, nie Fließkomma |
| `stock_quantity` | `bestand` | Bestand des Hauptartikels |
| `condition` | `merkmale.Zustand` | |
| `ean` | `merkmale.EAN` | |
| `category` | `kategorien[]` | wird angelegt, falls unbekannt — nichts ist fest verdrahtet |
| `image_urls` | `bilder[]` | Reihenfolge bleibt erhalten |

Nur mitgeschickte Felder werden geschrieben. Was das Lager nicht kennt — etwa
ein im Backoffice gepflegter SEO-Text — bleibt unangetastet.

### Antworten

| Status | Bedeutung |
|---|---|
| `201` | Artikel neu angelegt |
| `200` | Artikel aktualisiert |
| `401` | API-Schlüssel falsch oder fehlt |
| `422` | Daten unvollständig, mit Feldliste |
| `503` | `INGEST_API_KEY` im Shop nicht gesetzt |

Netzwerkfehler und `5xx` werden als `ShopConnectorError` gemeldet: der Job läuft
in den normalen Retry mit wachsendem Abstand, der Artikel bleibt „Shopbereit“.

### Einrichtung

Auf dem Lager-Server (im Ordner `backend`):

```
docker compose exec api python -m app.cli shop-verbinden --url https://<shop>.vercel.app
```

Der Befehl legt die Verbindung an (oder erneuert ihre Schlüssel), erzeugt
`INGEST_API_KEY` und das Webhook-Geheimnis und gibt die drei Werte aus, die im
Shop (Vercel → Settings → Environment Variables, Production) einzutragen sind:
`INGEST_API_KEY`, `LAGER_WEBHOOK_URL`, `LAGER_WEBHOOK_SECRET`. Danach den Shop
neu deployen und prüfen:

```
docker compose exec api python -m app.cli shop-testen
```

Der Test prüft Erreichbarkeit, Datenbankzustand (über `/api/health`) **und**
den Schlüssel. Veröffentlicht wird im Adminbereich unter „Freigabe“.

Bildadressen: Der Shop lädt die Shopbilder direkt vom Lager-Server. Die
öffentliche Adresse ergibt sich aus `DOMAIN` (`https://<DOMAIN>/api/v1/media/…`)
oder ausdrücklich aus `MEDIA_PUBLIC_BASE_URL`.

### Rückrichtung: Verkauf bucht Bestand ab

Sobald eine Bestellung bezahlt ist (`markOrderPaid`), meldet der Shop sie an
`POST /shop/webhooks/{connection_id}/order`, signiert mit HMAC-SHA256 über
`webhook_secret`. Jede Position wird über die SKU zugeordnet und als Movement
`sale` gebucht — jede Bestandsänderung bleibt nachvollziehbar.

Dafür braucht der Shop zwei weitere Umgebungsvariablen:

```
LAGER_WEBHOOK_URL=https://lager.example.de/api/v1/shop/webhooks/<connection_id>/order
LAGER_WEBHOOK_SECRET=<gleicher Wert wie webhook_secret der Verbindung>
```

Fehlt eine davon, unterbleibt die Meldung — der Shop läuft normal weiter.
Ist das Lager nicht erreichbar, wird der Fehler protokolliert, die bezahlte
Bestellung aber **nicht** zurückgerollt: eine Rückmeldung darf einen
abgeschlossenen Zahlungsvorgang nie scheitern lassen. Der Bestand ist dann im
Lager nachzuziehen.
