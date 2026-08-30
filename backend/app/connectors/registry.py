"""Connector-Registry: löst eine ShopConnection-Zeile in eine Connector-Instanz auf.
Neue Shopsysteme = neue Adapterklasse + Registrierung hier."""
import json

from app.connectors.base import ShopConnector, ShopConnectorError
from app.connectors.woocommerce import WooCommerceConnector
from app.models.shop import ShopConnection
from app.utils.security import decrypt_credentials

_CONNECTORS: dict[str, type[ShopConnector]] = {
    WooCommerceConnector.connector_type: WooCommerceConnector,
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
