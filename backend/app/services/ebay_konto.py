"""eBay-Konto: Anmeldung (OAuth), Einrichtung und regelmäßiger Abruf der Verkäufe.

Anmeldung: Im Lager-Web „Mit eBay verbinden“ → eBay-Anmeldeseite → eBay leitet
auf /api/v1/shop/ebay/rueckruf zurück. Der Rückruf kommt ohne Lager-Anmeldung;
welche Verbindung (und Firma) gemeint ist, steht im signierten `state`.

Verkäufe: Ein Hintergrundauftrag je eBay-Verbindung holt alle paar Minuten neue
Bestellungen, bucht den Bestand ab (einmal je Bestellposition, Referenz
„ebay:<Bestellung>:<Position>“) und gleicht alle anderen Kanäle an. Er plant
sich danach selbst neu ein.
"""
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlencode

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.connectors import ebay
from app.connectors.base import ShopConnectorError
from app.connectors.registry import build_connector
from app.jobs import queue
from app.models import Job, JobType, MovementType, Product, ShopConnection, StockMovement
from app.models.job import JobStatus
from app.services import kanaele, stock_service
from app.utils.security import decrypt_credentials, encrypt_credentials

log = logging.getLogger("winterfeld.ebay")
STATE_GUELTIG = 15 * 60
ERSTER_ABRUF = timedelta(days=2)
UEBERLAPPUNG = timedelta(minutes=15)


class EbayFehler(Exception):
    pass


# ── Zugangsdaten ────────────────────────────────────────────────────────────

def zugangsdaten(connection: ShopConnection) -> dict:
    if not connection.credentials_encrypted:
        return {}
    return json.loads(decrypt_credentials(connection.credentials_encrypted))


def zugangsdaten_ergaenzen(connection: ShopConnection, werte: dict) -> None:
    daten = zugangsdaten(connection)
    daten.update({k: v for k, v in werte.items() if v is not None})
    connection.credentials_encrypted = encrypt_credentials(json.dumps(daten))


# ── Anmeldung ───────────────────────────────────────────────────────────────

def _signatur(text: str) -> str:
    return hmac.new(get_settings().jwt_secret.encode(), text.encode(), hashlib.sha256).hexdigest()[:32]


def state_erzeugen(connection: ShopConnection, jetzt: float | None = None) -> str:
    ablauf = int((jetzt or time.time()) + STATE_GUELTIG)
    roh = f"{connection.id}.{connection.tenant_id}.{ablauf}"
    return f"{roh}.{_signatur(roh)}"


def state_pruefen(state: str, jetzt: float | None = None) -> tuple[str, str]:
    """(connection_id, tenant_id) – oder EbayFehler bei falscher/abgelaufener Signatur."""
    try:
        connection_id, tenant_id, ablauf, sig = state.split(".")
    except ValueError as exc:
        raise EbayFehler("Ungültiger Rückruf") from exc
    if not hmac.compare_digest(sig, _signatur(f"{connection_id}.{tenant_id}.{ablauf}")):
        raise EbayFehler("Ungültiger Rückruf")
    if int(ablauf) < (jetzt or time.time()):
        raise EbayFehler("Die Anmeldung hat zu lange gedauert – bitte erneut verbinden")
    return connection_id, tenant_id


def anmelde_url(connection: ShopConnection) -> str:
    if not ebay.app_konfiguriert():
        raise EbayFehler("Auf dem Server fehlen EBAY_CLIENT_ID, EBAY_CLIENT_SECRET oder EBAY_RUNAME (.env)")
    s = get_settings()
    return ebay.umgebung()["auth"] + "/oauth2/authorize?" + urlencode({
        "client_id": s.ebay_client_id, "response_type": "code", "redirect_uri": s.ebay_runame,
        "scope": ebay.SCOPES, "state": state_erzeugen(connection), "prompt": "login"})


def rueckruf(db: Session, connection: ShopConnection, code: str) -> dict:
    """Code gegen Tokens tauschen, speichern, Konto einrichten, Abruf starten."""
    antwort = ebay.token_holen({"grant_type": "authorization_code", "code": code,
                                "redirect_uri": get_settings().ebay_runame})
    ablauf = datetime.now(timezone.utc) + timedelta(seconds=int(antwort.get("refresh_token_expires_in", 0)))
    zugangsdaten_ergaenzen(connection, {"refresh_token": antwort["refresh_token"],
                                        "refresh_token_ablauf": ablauf.isoformat()})
    ergebnis = {"verbunden": True, "einrichtung": None}
    try:
        ergebnis["einrichtung"] = einrichten(connection)
    except ShopConnectorError as exc:
        ergebnis["einrichtung_fehler"] = str(exc)
    abruf_einplanen(db, connection)
    return ergebnis


def einrichten(connection: ShopConnection) -> dict:
    """Geschäftsbedingungen und Lagerort ermitteln und in den Zugangsdaten merken."""
    connector = build_connector(connection)
    werte = connector.einrichtung()
    zugangsdaten_ergaenzen(connection, werte)
    return werte


# ── Verkäufe abholen ────────────────────────────────────────────────────────

def abruf_einplanen(db: Session, connection: ShopConnection, verzoegerung: int = 0,
                    ausser: str | None = None) -> None:
    """Genau eine wartende Abruf-Kette je Verbindung. [ausser]: der gerade
    laufende Auftrag, der sich selbst neu einplant."""
    wartend = db.scalars(select(Job).where(
        Job.job_type == JobType.MARKTPLATZ_ABGLEICH.value,
        Job.status.in_([JobStatus.QUEUED.value, JobStatus.RUNNING.value,
                        JobStatus.FAILED.value]))).all()
    if any((j.payload or {}).get("connection_id") == connection.id and j.id != ausser
           for j in wartend):
        return
    queue.enqueue(db, job_type=JobType.MARKTPLATZ_ABGLEICH.value,
                  payload={"connection_id": connection.id}, delay_seconds=verzoegerung)


def _cent(wert) -> int | None:
    if wert in (None, ""):
        return None
    return int((Decimal(str(wert)) * 100).quantize(Decimal("1")))


def versand_shop(db: Session) -> ShopConnection | None:
    """Der eigene Shop, in dessen Admin Marktplatzbestellungen versendet werden."""
    return db.scalar(select(ShopConnection).where(
        ShopConnection.connector_type == "winterfeld", ShopConnection.is_active.is_(True))
        .order_by(ShopConnection.created_at).limit(1))


def shop_bestellung(bestellung: dict) -> dict:
    """eBay-Bestellung → Format der Shop-Schnittstelle /api/ingest/bestellung."""
    a = bestellung.get("lieferadresse") or {}
    positionen = []
    for pos in bestellung["positionen"]:
        menge = max(int(pos["menge"] or 1), 1)
        gesamt = _cent(pos.get("preis")) or 0
        positionen.append({"sku": pos.get("sku") or None, "name": (pos.get("titel") or pos.get("sku") or "Artikel")[:300],
                           "menge": menge, "einzelpreisCents": round(gesamt / menge)})
    return {
        "quelle": "ebay",
        "bestellnummer": bestellung["bestellnummer"],
        "email": a.get("email"),
        "telefon": a.get("telefon"),
        "kaeufer": bestellung.get("kaeufer"),
        "lieferadresse": {"name": a.get("name") or bestellung.get("kaeufer") or "eBay-Käufer",
                          "strasse": a.get("strasse") or "", "zusatz": a.get("zusatz"),
                          "plz": a.get("plz") or "", "ort": a.get("ort") or "",
                          "land": (a.get("land") or "DE").upper()},
        "positionen": positionen,
        "versandCents": _cent(bestellung.get("versandkosten")) or 0,
        "summeCents": _cent(bestellung.get("summe")),
        "bezahltAm": bestellung.get("bezahlt_am"),
    }


def verkaeufe_abholen(db: Session, connection: ShopConnection) -> dict:
    daten = zugangsdaten(connection)
    jetzt = datetime.now(timezone.utc)
    zuletzt = daten.get("letzter_bestellabruf")
    seit = (datetime.fromisoformat(zuletzt) - UEBERLAPPUNG) if zuletzt else jetzt - ERSTER_ABRUF
    connector = build_connector(connection)
    bestellungen = connector.bestellungen_seit(seit.strftime("%Y-%m-%dT%H:%M:%S.000Z"))

    shop = versand_shop(db)
    gebucht, unbekannt, fehler, weitergegeben = 0, [], [], 0
    for bestellung in bestellungen:
        if bestellung["storniert"] or not bestellung["bezahlt"]:
            continue
        neu = False
        for pos in bestellung["positionen"]:
            referenz = f"ebay:{bestellung['bestellnummer']}:{pos['position']}"
            if db.scalar(select(StockMovement.id).where(StockMovement.reference == referenz).limit(1)):
                continue  # schon gebucht (Abruffenster überlappt absichtlich)
            neu = True
            product = db.scalar(select(Product).where(Product.internal_sku == pos["sku"])) if pos["sku"] else None
            if product is None:
                unbekannt.append(pos["sku"] or pos["titel"])
                continue
            try:
                stock_service.apply_movement(
                    db, product=product, movement_type=MovementType.SALE.value,
                    quantity_change=-pos["menge"], user=None,
                    reason="Verkauf bei eBay", reference=referenz)
                kanaele.bestand_nachziehen(db, product)
                gebucht += 1
            except stock_service.StockError as exc:
                fehler.append(f"{pos['sku']}: {exc}")
        if neu and shop is not None:
            # Versand über den Shop-Admin (DHL-Etikett). Der Shop legt eine
            # Bestellung nie doppelt an – ein erneutes Weitergeben schadet nicht.
            queue.enqueue(db, job_type=JobType.BESTELLUNG_WEITERGEBEN.value, payload={
                "shop_connection_id": shop.id, "bestellung": shop_bestellung(bestellung)})
            weitergegeben += 1
    zugangsdaten_ergaenzen(connection, {"letzter_bestellabruf": jetzt.isoformat()})
    if unbekannt or fehler:
        log.warning("eBay-Abruf %s: unbekannt %s, Fehler %s", connection.name, unbekannt, fehler)
    return {"bestellungen": len(bestellungen), "gebucht": gebucht, "weitergegeben": weitergegeben,
            "unbekannt": unbekannt, "fehler": fehler}


def versand_eintragen(db: Session, bestellnummer: str, sendungsnummer: str, versender: str) -> str:
    """Sendungsnummer aus dem Shop-Admin bei eBay eintragen (Bestellung → versendet)."""
    verbindungen = db.scalars(select(ShopConnection).where(
        ShopConnection.connector_type == "ebay", ShopConnection.is_active.is_(True))
        .order_by(ShopConnection.created_at)).all()
    angemeldet = [c for c in verbindungen if zugangsdaten(c).get("refresh_token")]
    if not angemeldet:
        raise EbayFehler("Keine angemeldete eBay-Verbindung")
    connector = build_connector(angemeldet[0])
    positionen = connector.positionen_der_bestellung(bestellnummer)
    if not positionen:
        raise EbayFehler(f"eBay-Bestellung {bestellnummer} ohne Positionen")
    connector.versand_melden(bestellnummer, positionen, sendungsnummer, EBAY_VERSENDER.get(versender, "DHL"))
    return angemeldet[0].id


# Versandart im Shop → Versanddienstleister-Code bei eBay.
EBAY_VERSENDER = {"dhl_paket": "DHL", "dhl_express": "DHL"}
