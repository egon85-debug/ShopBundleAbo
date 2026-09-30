"""Referenz-Connector: WooCommerce REST API v3 (Basic Auth über HTTPS)."""
from decimal import Decimal

import httpx

from app.connectors.base import (
    ShopConnector,
    ShopConnectorError,
    ShopListingPayload,
    ShopPublishResult,
)


class WooCommerceConnector(ShopConnector):
    connector_type = "woocommerce"
    anzeige_name = "WooCommerce"

    def _client(self) -> httpx.Client:
        key = self.credentials.get("consumer_key", "")
        secret = self.credentials.get("consumer_secret", "")
        if not key or not secret:
            raise ShopConnectorError("WooCommerce-Credentials unvollständig")
        return httpx.Client(
            base_url=self.base_url + "/wp-json/wc/v3",
            auth=(key, secret),
            timeout=60,
        )

    def _request(self, method: str, path: str, json_body: dict | None = None) -> dict:
        try:
            with self._client() as client:
                response = client.request(method, path, json=json_body)
                response.raise_for_status()
                return response.json() if response.content else {}
        except httpx.HTTPStatusError as exc:
            raise ShopConnectorError(
                f"WooCommerce {method} {path}: HTTP {exc.response.status_code} — "
                f"{exc.response.text[:500]}"
            ) from exc
        except httpx.HTTPError as exc:
            raise ShopConnectorError(f"WooCommerce nicht erreichbar: {exc}") from exc

    def test_connection(self) -> None:
        self._request("GET", "/products", None)

    def _payload(self, listing: ShopListingPayload, status: str = "publish") -> dict:
        description = listing.long_description
        if listing.bullet_points:
            bullets = "".join(f"<li>{b}</li>" for b in listing.bullet_points)
            description = f"<ul>{bullets}</ul>" + description
        payload = {
            "name": listing.title,
            "sku": listing.sku,
            "type": "simple",
            "status": status,
            "regular_price": str(listing.price),
            "description": description,
            "short_description": listing.short_description,
            "manage_stock": True,
            "stock_quantity": listing.stock_quantity,
            "attributes": [
                {"name": k, "options": [str(v)], "visible": True}
                for k, v in listing.attributes.items()
            ],
            "tags": [{"name": t} for t in listing.tags],
            "meta_data": [
                {"key": "_winterfeld_condition", "value": listing.condition},
                {"key": "_winterfeld_ean", "value": listing.ean or ""},
            ],
        }
        if listing.url_slug:
            payload["slug"] = listing.url_slug
        if listing.image_urls:
            payload["images"] = [{"src": url} for url in listing.image_urls]
        return payload

    def publish_product(self, listing: ShopListingPayload) -> ShopPublishResult:
        data = self._request("POST", "/products", self._payload(listing))
        return ShopPublishResult(external_id=str(data["id"]), external_url=data.get("permalink"))

    def update_product(self, external_id: str, listing: ShopListingPayload) -> None:
        self._request("PUT", f"/products/{external_id}", self._payload(listing))

    def update_stock(self, external_id: str, quantity: int) -> None:
        self._request("PUT", f"/products/{external_id}",
                      {"manage_stock": True, "stock_quantity": quantity})

    def update_price(self, external_id: str, price: Decimal) -> None:
        self._request("PUT", f"/products/{external_id}", {"regular_price": str(price)})

    def delist_product(self, external_id: str) -> None:
        self._request("PUT", f"/products/{external_id}", {"status": "draft"})

    def required_fields(self) -> list[str]:
        return ["product_name", "sale_price", "category"]
