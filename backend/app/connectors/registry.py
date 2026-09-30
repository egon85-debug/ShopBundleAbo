"""Connector-Registry: löst eine ShopConnection-Zeile in eine Connector-Instanz auf.
Neue Shopsysteme = neue Adapterklasse + Registrierung hier."""
import json

from app.connectors.base import ShopConnector, ShopConnectorError
from app.connectors.ebay import EbayConnector
from app.connectors.kleinanzeigen import KleinanzeigenConnector
from app.connectors.winterfeld import WinterfeldShopConnector
from app.connectors.woocommerce import WooCommerceConnector
from app.models.shop import ShopConnection
from app.utils.security import decrypt_credentials

_CONNECTORS: dict[str, type[ShopConnector]] = {
    WinterfeldShopConnector.connector_type: WinterfeldShopConnector,
    WooCommerceConnector.connector_type: WooCommerceConnector,
    KleinanzeigenConnector.connector_type: KleinanzeigenConnector,
    EbayConnector.connector_type: EbayConnector,
}


def register_connector(cls: type[ShopConnector]) -> None:
    _CONNECTORS[cls.connector_type] = cls


def available_connector_types() -> list[str]:
    return sorted(_CONNECTORS)


def build_connector(connection: ShopConnection) -> ShopConnector:
    cls = _CONNECTORS.get(connection.connector_type)
    if cls is None:
        raise ShopConnectorError(f"Unbekannter Connector-Typ: {connection.connector_type}")
    credentials: dict = {}
    if connection.credentials_encrypted:
        credentials = json.loads(decrypt_credentials(connection.credentials_encrypted))
    return cls(connection.base_url, credentials)


def connector_klasse(connector_type: str) -> type[ShopConnector] | None:
    return _CONNECTORS.get(connector_type)
