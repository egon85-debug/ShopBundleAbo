"""Shop-Connector-Abstraktion (Anforderung 16): Die Kernlogik kennt nur dieses
Interface; konkrete Shopsysteme sind Adapter."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal


@dataclass
class ShopListingPayload:
    sku: str
    title: str
    short_description: str
    long_description: str
    price: Decimal
    stock_quantity: int
    condition: str
    category: str | None = None
    ean: str | None = None
    image_urls: list[str] = field(default_factory=list)
    bullet_points: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    url_slug: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    attributes: dict = field(default_factory=dict)
    # Lebensmittel & Getränke
    net_content_amount: Decimal | None = None
    net_content_unit: str | None = None
    units_per_pack: int | None = None
    deposit_amount: Decimal | None = None
    deposit_type: str | None = None
    ingredients: str | None = None
    allergens: str | None = None
    food_notes: str | None = None


@dataclass
class ShopPublishResult:
    external_id: str
    external_url: str | None = None


class ShopConnectorError(Exception):
    """Fehler in der Shop-Kommunikation → Job-Retry, Artikel bleibt 'Shopbereit'."""


class ShopConnector(ABC):
    connector_type: str

    def __init__(self, base_url: str, credentials: dict) -> None:
        self.base_url = base_url.rstrip("/")
        self.credentials = credentials

    @abstractmethod
    def test_connection(self) -> None: ...

    @abstractmethod
    def publish_product(self, listing: ShopListingPayload) -> ShopPublishResult: ...

    @abstractmethod
    def update_product(self, external_id: str, listing: ShopListingPayload) -> None: ...

    @abstractmethod
    def update_stock(self, external_id: str, quantity: int) -> None: ...

    @abstractmethod
    def update_price(self, external_id: str, price: Decimal) -> None: ...

    @abstractmethod
    def delist_product(self, external_id: str) -> None: ...

    def required_fields(self) -> list[str]:
        """Pflichtangaben des Shops für die Qualitätskontrolle (Anforderung 30)."""
        return []
