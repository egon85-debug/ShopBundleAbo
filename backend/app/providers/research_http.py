"""Produkt- und Preisrecherche über eine konfigurierbare HTTP-Recherche-API.

Erwartetes API-Format (bewusst schlicht gehalten, damit sich gängige Such-/Shopping-APIs
über einen kleinen Gateway adaptieren lassen):

  GET {PRICE_RESEARCH_API_BASE}/products?ean=…&mpn=…&q=…   → {"items": [ResearchCandidate…]}
  GET {PRICE_RESEARCH_API_BASE}/offers?ean=…&q=…           → {"items": [PriceOffer…]}

Auth: "Authorization: Bearer {PRICE_RESEARCH_API_KEY}".
Jede Antwort wird gegen die Pydantic-Schemas validiert; ungültige Einträge werden
verworfen statt übernommen."""
import httpx

from app.config import get_settings
from app.providers.base import ProductResearchProvider, ProviderNotConfigured
from app.schemas.ai import PriceOffer, ResearchCandidate


class HttpProductResearchProvider(ProductResearchProvider):
    name = "http-research"

    def _client_config(self) -> tuple[str, dict]:
        s = get_settings()
        if not s.price_research_api_base:
            raise ProviderNotConfigured("PRICE_RESEARCH_API_BASE ist nicht gesetzt")
        headers = {}
        if s.price_research_api_key:
            headers["Authorization"] = f"Bearer {s.price_research_api_key}"
        return s.price_research_api_base.rstrip("/"), headers

    def identify_product(
        self, *, ean: str | None, mpn: str | None, query: str | None
    ) -> list[ResearchCandidate]:
        base, headers = self._client_config()
        params = {k: v for k, v in {"ean": ean, "mpn": mpn, "q": query}.items() if v}
        if not params:
            return []
        response = httpx.get(f"{base}/products", params=params, headers=headers, timeout=60)
        response.raise_for_status()
        candidates = []
        for item in response.json().get("items", []):
            try:
                candidates.append(ResearchCandidate.model_validate(item))
            except Exception:
                continue  # ungültige Einträge nie übernehmen
        return candidates

    def find_offers(self, *, ean: str | None, query: str, condition: str) -> list[PriceOffer]:
        base, headers = self._client_config()
        params = {k: v for k, v in {"ean": ean, "q": query, "condition": condition}.items() if v}
        response = httpx.get(f"{base}/offers", params=params, headers=headers, timeout=60)
        response.raise_for_status()
        offers = []
        for item in response.json().get("items", []):
            try:
                offers.append(PriceOffer.model_validate(item))
            except Exception:
                continue
        return offers


class AbgeschalteteRecherche(ProductResearchProvider):
    """RESEARCH_PROVIDER=off: keine Recherche, die Kette laeuft ohne sie weiter."""
    name = "off"

    def identify_product(self, *, ean, mpn, query):
        raise ProviderNotConfigured("Recherche ist abgeschaltet (RESEARCH_PROVIDER=off)")

    def find_offers(self, *, ean, query, condition):
        raise ProviderNotConfigured("Recherche ist abgeschaltet (RESEARCH_PROVIDER=off)")
