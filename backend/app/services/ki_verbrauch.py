"""Verbrauch und Kosten der KI-Aufrufe.

Jede Antwort der Anthropic-API meldet, wie viele Tokens sie gelesen und
geschrieben hat und wie viele Websuchen gelaufen sind. Der Provider meldet
das hier an [erfassen]; der Auftrag, der den Aufruf ausgelöst hat, sammelt
es mit [messen] ein und schreibt es an seinen KI-Lauf (ai_runs). So stehen
echte Kosten je Artikel und je Schritt in der Datenbank statt Schätzungen.

Preise: Listenpreise der Anthropic-API in US-Dollar je 1 Mio. Tokens
(Stand 2026-06). Bei einem Modell, das hier fehlt, bleiben die Tokens
gespeichert, nur die Kosten nicht.
"""
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from decimal import Decimal

# Modell → (Eingabe, Ausgabe, Cache-Lesen) in $ je 1 Mio. Tokens.
PREISE: dict[str, tuple[Decimal, Decimal, Decimal]] = {
    "claude-fable-5-1": (Decimal("10"), Decimal("50"), Decimal("0.25")),
    "claude-fable-5": (Decimal("10"), Decimal("50"), Decimal("1")),
    "claude-opus-5-5": (Decimal("4"), Decimal("20"), Decimal("0.20")),
    "claude-opus-5": (Decimal("5"), Decimal("25"), Decimal("0.50")),
    "claude-opus-4-8": (Decimal("5"), Decimal("25"), Decimal("0.50")),
    "claude-opus-4-7": (Decimal("5"), Decimal("25"), Decimal("0.50")),
    "claude-opus-4-6": (Decimal("5"), Decimal("25"), Decimal("0.50")),
    "claude-sonnet-5": (Decimal("2"), Decimal("10"), Decimal("0.20")),
    "claude-sonnet-4-6": (Decimal("3"), Decimal("15"), Decimal("0.30")),
    "claude-haiku-4-5": (Decimal("1"), Decimal("5"), Decimal("0.10")),
}
# Cache schreiben (5 Minuten) kostet das 1,25-fache der Eingabe.
CACHE_SCHREIBEN_FAKTOR = Decimal("1.25")
WEBSUCHE_USD = Decimal("0.01")  # 10 $ je 1.000 Suchen
MIO = Decimal(1_000_000)


@dataclass
class Verbrauch:
    """Verbrauch einer einzelnen API-Antwort."""
    modell: str
    eingabe: int = 0
    ausgabe: int = 0
    cache_lesen: int = 0
    cache_schreiben: int = 0
    websuchen: int = 0

    @property
    def kosten_usd(self) -> Decimal | None:
        preis = PREISE.get(_grundmodell(self.modell))
        if preis is None:
            return None
        ein, aus, lesen = preis
        return ((self.eingabe * ein + self.ausgabe * aus + self.cache_lesen * lesen
                 + self.cache_schreiben * ein * CACHE_SCHREIBEN_FAKTOR) / MIO
                + self.websuchen * WEBSUCHE_USD)


def _grundmodell(modell: str) -> str:
    """„claude-opus-5-20260101“ oder mit Plattform-Präfix → Eintrag in PREISE."""
    modell = modell.removeprefix("anthropic.")
    for name in sorted(PREISE, key=len, reverse=True):
        if modell == name or modell.startswith(name + "-2") or modell.startswith(name + "@"):
            return name
    return modell


_laufend: ContextVar[list[Verbrauch] | None] = ContextVar("ki_verbrauch", default=None)


@contextmanager
def messen() -> Iterator[list[Verbrauch]]:
    """Sammelt den Verbrauch aller KI-Aufrufe innerhalb des Blocks."""
    liste: list[Verbrauch] = []
    token = _laufend.set(liste)
    try:
        yield liste
    finally:
        _laufend.reset(token)


def erfassen(response, angefragtes_modell: str) -> None:
    """Vom Provider nach jeder API-Antwort aufgerufen."""
    liste = _laufend.get()
    usage = getattr(response, "usage", None)
    if liste is None or usage is None:
        return
    server = getattr(usage, "server_tool_use", None)
    liste.append(Verbrauch(
        # Bei einer serverseitigen Ausweichantwort nennt die Antwort das Modell,
        # das tatsächlich gerechnet hat.
        modell=str(getattr(response, "model", None) or angefragtes_modell),
        eingabe=int(getattr(usage, "input_tokens", 0) or 0),
        ausgabe=int(getattr(usage, "output_tokens", 0) or 0),
        cache_lesen=int(getattr(usage, "cache_read_input_tokens", 0) or 0),
        cache_schreiben=int(getattr(usage, "cache_creation_input_tokens", 0) or 0),
        websuchen=int(getattr(server, "web_search_requests", 0) or 0) if server else 0,
    ))


def summe(liste: list[Verbrauch]) -> dict:
    """Zusammenfassung für die Datenbank (Spalten von ai_runs)."""
    kosten = [v.kosten_usd for v in liste]
    modelle = sorted({v.modell for v in liste})
    return {
        "model": ", ".join(modelle)[:128] or None,
        "input_tokens": sum(v.eingabe for v in liste),
        "output_tokens": sum(v.ausgabe for v in liste),
        "cache_read_tokens": sum(v.cache_lesen for v in liste),
        "cache_write_tokens": sum(v.cache_schreiben for v in liste),
        "web_searches": sum(v.websuchen for v in liste),
        "api_calls": len(liste),
        "cost_usd": (sum(kosten, Decimal(0)).quantize(Decimal("0.000001"))
                     if liste and None not in kosten else None),
    }


# ── Auswertung für die Verwaltung ────────────────────────────────────────────

def laeufe_fuer_artikel(db, product_id: str) -> dict:
    """Alle KI-Läufe eines Artikels mit Verbrauch, neueste zuerst."""
    from sqlalchemy import select

    from app.models import AiRun
    laeufe = db.scalars(select(AiRun).where(AiRun.product_id == product_id)
                        .order_by(AiRun.created_at.desc())).all()
    return {
        "summe_usd": _geld(sum((Decimal(r.cost_usd) for r in laeufe if r.cost_usd is not None),
                               Decimal(0))),
        "ungemessen": sum(1 for r in laeufe if r.cost_usd is None
                          and r.provider != "wiederverwendet"),
        "laeufe": [{
            "id": r.id, "kind": r.kind, "provider": r.provider, "model": r.model,
            "status": r.status, "created_at": r.created_at,
            "input_tokens": r.input_tokens, "output_tokens": r.output_tokens,
            "cache_read_tokens": r.cache_read_tokens, "web_searches": r.web_searches,
            "api_calls": r.api_calls, "duration_ms": r.duration_ms,
            "cost_usd": _geld(r.cost_usd) if r.cost_usd is not None else None,
        } for r in laeufe],
    }


def uebersicht(db, seit) -> dict:
    """Kosten seit einem Zeitpunkt: gesamt, je Zweck, je Artikel im Schnitt."""
    from sqlalchemy import func, select

    from app.models import AiRun
    bedingung = (AiRun.created_at >= seit, AiRun.cost_usd.is_not(None))
    nach_zweck = db.execute(select(AiRun.kind, func.sum(AiRun.cost_usd), func.count())
                            .where(*bedingung).group_by(AiRun.kind)).all()
    artikel = db.scalar(select(func.count(func.distinct(AiRun.product_id)))
                        .where(*bedingung, AiRun.product_id.is_not(None))) or 0
    gesamt = sum((Decimal(s or 0) for _, s, _ in nach_zweck), Decimal(0))
    tokens = db.execute(select(func.sum(AiRun.input_tokens), func.sum(AiRun.output_tokens),
                               func.sum(AiRun.web_searches)).where(*bedingung)).one()
    wiederverwendet = db.scalar(select(func.count()).select_from(AiRun).where(
        AiRun.created_at >= seit, AiRun.provider == "wiederverwendet")) or 0
    return {
        "seit": seit,
        "gesamt_usd": _geld(gesamt),
        "artikel": artikel,
        "schnitt_je_artikel_usd": _geld(gesamt / artikel) if artikel else None,
        "nach_zweck": {kind: {"usd": _geld(Decimal(s or 0)), "laeufe": n}
                       for kind, s, n in nach_zweck},
        "eingabe_tokens": int(tokens[0] or 0),
        "ausgabe_tokens": int(tokens[1] or 0),
        "websuchen": int(tokens[2] or 0),
        "wiederverwendet": wiederverwendet,
    }


def _geld(wert) -> str:
    """Als Text mit 4 Nachkommastellen – Cent-Bruchteile sind hier üblich."""
    return str(Decimal(wert).quantize(Decimal("0.0001")))
