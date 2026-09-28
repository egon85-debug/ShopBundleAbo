"""Kostenlose, offene Produktdatenbanken – vor jeder kostenpflichtigen Websuche.

Open Food Facts und seine Geschwister (Kosmetik, Tierfutter, sonstige Produkte)
liefern zu einer EAN Marke, Name und Inhalt. Ein Treffer dort erspart die
KI-Websuche, den teuersten Schritt je Artikel. Die Daten sind frei (ODbL);
Datenbank und Fundstelle stehen im KI-Protokoll des Artikels.

Kein Treffer, Zeitüberschreitung oder Fehler → None; dann sucht die KI wie bisher.
"""
import logging
import re

import httpx

from app.schemas.ai import ResearchCandidate
from app.utils.ean import is_valid_gtin, normalize_gtin

log = logging.getLogger(__name__)

# Reihenfolge: Lebensmittel sind im Lager am häufigsten.
DATENBANKEN = (
    ("Open Food Facts", "https://world.openfoodfacts.org"),
    ("Open Beauty Facts", "https://world.openbeautyfacts.org"),
    ("Open Pet Food Facts", "https://world.openpetfoodfacts.org"),
    ("Open Products Facts", "https://world.openproductsfacts.org"),
)
FELDER = "code,product_name,product_name_de,generic_name_de,brands,quantity"
# Die Betreiber bitten um eine erkennbare Kennung statt eines Browser-Namens.
KENNUNG = "WinterfeldLager/1.0 (+https://winterfeld-logistik.de)"
ZEITLIMIT = 6.0
# Offene Datenbanken enthalten auch Test- und Platzhaltereinträge.
MUELL = re.compile(r"delete|diagnostic|test ?product|dummy|placeholder|^x+$|^test$", re.I)
# Nur für Tests: nachgestellte Antworten statt echter Anfragen.
_transport: httpx.BaseTransport | None = None


def nachschlagen(ean: str | None, *, name_bekannt: bool = False,
                 erkannt: str = "") -> ResearchCandidate | None:
    """Artikel zur EAN in den offenen Datenbanken suchen.

    name_bekannt: Der Artikel hat schon einen Namen (Foto oder Eingabe). Dann
    wird der Name aus der Datenbank nicht übernommen – er ist dort oft knapp
    oder in einer anderen Sprache.
    erkannt: Marke, Hersteller und Name vom Foto. Passt die Marke aus der
    Datenbank nicht dazu, war die EAN vermutlich falsch abgelesen → kein Treffer.
    """
    ean = normalize_gtin(ean)
    if not ean or not is_valid_gtin(ean):
        return None
    with httpx.Client(timeout=ZEITLIMIT, headers={"User-Agent": KENNUNG},
                      follow_redirects=True, transport=_transport) as client:
        for quelle, basis in DATENBANKEN:
            try:
                antwort = client.get(f"{basis}/api/v2/product/{ean}.json",
                                     params={"fields": FELDER})
            except httpx.HTTPError as exc:
                log.info("%s nicht erreichbar: %s", quelle, exc)
                continue
            if antwort.status_code != 200:
                continue
            try:
                daten = antwort.json()
            except ValueError:
                continue
            if daten.get("status") != 1:
                continue
            treffer = _treffer(daten.get("product") or {}, ean, quelle, basis, name_bekannt)
            if treffer is None:
                continue
            if erkannt and not _passt(treffer.brand, erkannt):
                log.info("%s: Marke %r passt nicht zu %r – EAN falsch gelesen?",
                         quelle, treffer.brand, erkannt)
                return None
            return treffer
    return None


def _text(wert) -> str | None:
    wert = (wert or "").strip() if isinstance(wert, str) else None
    return wert or None


def _treffer(produkt: dict, ean: str, quelle: str, basis: str,
             name_bekannt: bool) -> ResearchCandidate | None:
    name = _text(produkt.get("product_name_de")) or _text(produkt.get("product_name"))
    marke = _text((produkt.get("brands") or "").split(",")[0])
    # Ohne Marke oder ohne jeden Namen ist der Eintrag zu dünn – dann lieber suchen.
    if not marke or not (name or name_bekannt):
        return None
    if MUELL.search(marke) or (name and MUELL.search(name)):
        return None
    technisch = {}
    if inhalt := _text(produkt.get("quantity")):
        technisch["Inhalt"] = inhalt
    return ResearchCandidate(
        product_name=None if name_bekannt else name,
        brand=marke,
        ean=ean,
        description=_text(produkt.get("generic_name_de")),
        technical_data=technisch,
        source_url=f"{basis}/product/{ean}",
        # Die EAN stimmt exakt überein.
        match_score=0.95,
    )


def _woerter(text: str) -> set[str]:
    return {w for w in re.split(r"[^0-9a-zäöüß]+", text.lower()) if len(w) >= 3}


def _passt(marke: str | None, erkannt: str) -> bool:
    """Teilt die Marke aus der Datenbank ein Wort mit dem vom Foto Erkannten?"""
    marke_w, erkannt_w = _woerter(marke or ""), _woerter(erkannt)
    if not marke_w or not erkannt_w:
        return True  # nichts zum Vergleichen – nicht ablehnen
    # „Coca-Cola“ ↔ „CocaCola“: auch ohne Trennzeichen vergleichen.
    zusammen = re.sub(r"[^0-9a-zäöüß]", "", (marke or "").lower())
    return bool(marke_w & erkannt_w) or (len(zusammen) >= 3 and zusammen in
                                         re.sub(r"[^0-9a-zäöüß]", "", erkannt.lower()))
