"""Bilder und Sprachaufnahmen: Ablage je Firma und Zugriff über signierte Adressen.

Ablage im Objekt-Storage, getrennt nach Firma:

    m/<tenant_id>/produkte/<product_id>/original/<name>.<ext>   Originalfoto (privat)
    m/<tenant_id>/produkte/<product_id>/shop/<name>.jpg         Shopbild
    m/<tenant_id>/produkte/<product_id>/sprache/<name>          Sprachaufnahme (privat)

So lassen sich Speicherverbrauch, Export und Löschung je Firma über den Pfad
erledigen. Dateien aus der Zeit vor der Mandantenfähigkeit (`products/…`)
bleiben lesbar; die Zugriffsprüfung hängt nicht am Pfad, sondern am Datensatz.

Zugriff (`GET /api/v1/media/<key>`):

- Mit gültiger Signatur jede Bilddatei. Signierte Adressen bekommt nur, wer
  angemeldet ist und den Artikel sehen darf — sie stehen in den API-Antworten
  der eigenen Firma. Die Signatur gilt für genau diese Datei und läuft ab.
- Ohne Signatur nur das Shopbild eines veröffentlichten Artikels (der Shop
  bindet es öffentlich ein).
- Sprachaufnahmen werden nie ausgeliefert.
- Alles andere: 404 — auch „gibt es, aber nicht für dich“, damit sich
  fremde Dateien nicht ertasten lassen.

Browser und App können bei <img> keine Anmeldung mitschicken; deshalb steckt
die Berechtigung in der Adresse. Damit Bilder im Zwischenspeicher bleiben, ist
die Adresse einen Tag lang gleich (Ablauf auf Tagesgrenzen gerundet) und gilt
danach noch mindestens einen weiteren Tag.
"""
import hashlib
import hmac
import time
from urllib.parse import quote

from app.config import get_settings

TAG = 86_400
MEDIEN_PFAD = "/api/v1/media"


def _praefix(tenant_id: str, product_id: str) -> str:
    return f"m/{tenant_id}/produkte/{product_id}"


def schluessel_original(tenant_id: str, product_id: str, name: str, ext: str) -> str:
    return f"{_praefix(tenant_id, product_id)}/original/{name}.{ext}"


def schluessel_sprache(tenant_id: str, product_id: str, name: str) -> str:
    return f"{_praefix(tenant_id, product_id)}/sprache/{name}"


def schluessel_shopbild(original_key: str) -> str:
    """Shopbild neben dem Original: neuer Pfad `/shop/`, alter Pfad `.shop.jpg`."""
    stamm = original_key.rsplit(".", 1)[0]
    if "/original/" in stamm and stamm.startswith("m/"):
        return stamm.replace("/original/", "/shop/", 1) + ".jpg"
    return stamm + ".shop.jpg"


def firmen_praefix(tenant_id: str) -> str:
    """Alles, was einer Firma gehört (neue Ablage) — für Speicherbedarf und Export."""
    return f"m/{tenant_id}/"


# ── Signaturen ──────────────────────────────────────────────────────────────

def _geheimnis() -> bytes:
    # Eigener Schlüssel, abgeleitet vom Anmeldegeheimnis: eine Bildsignatur
    # taugt so nie als Anmelde-Token und umgekehrt.
    return hmac.new(get_settings().jwt_secret.encode(), b"winterfeld-medien-v1",
                    hashlib.sha256).digest()


def _signatur(key: str, ablauf: int) -> str:
    nachricht = f"{key}\n{ablauf}".encode()
    return hmac.new(_geheimnis(), nachricht, hashlib.sha256).hexdigest()[:32]


def ablauf_fuer(jetzt: float | None = None) -> int:
    """Ende des übernächsten Tages (UTC): 24–48 Stunden gültig, einen Tag stabil."""
    jetzt = time.time() if jetzt is None else jetzt
    return (int(jetzt) // TAG + 2) * TAG


def signatur_pruefen(key: str, ablauf: str | int | None, sig: str | None,
                     jetzt: float | None = None) -> bool:
    if not ablauf or not sig:
        return False
    try:
        ablauf = int(ablauf)
    except (TypeError, ValueError):
        return False
    jetzt = time.time() if jetzt is None else jetzt
    if ablauf < jetzt:
        return False
    return hmac.compare_digest(_signatur(key, ablauf), sig)


# ── Adressen ────────────────────────────────────────────────────────────────

def _basis() -> str:
    """Öffentliche Basis der Medienadresse, ohne abschließenden Schrägstrich.

    MEDIA_PUBLIC_BASE_URL darf auf ein CDN zeigen, das auf diesen Endpunkt
    weiterleitet — nie direkt auf den Speicher, sonst entfiele die Prüfung.
    Ohne Domain bleibt die Adresse relativ (Lager-Web und App ergänzen sie).
    """
    s = get_settings()
    if s.media_public_base_url:
        return s.media_public_base_url.rstrip("/")
    if s.oeffentliche_basis():
        return s.oeffentliche_basis() + MEDIEN_PFAD
    return MEDIEN_PFAD


def signierte_url(key: str, jetzt: float | None = None) -> str:
    ablauf = ablauf_fuer(jetzt)
    return f"{_basis()}/{quote(key)}?ablauf={ablauf}&sig={_signatur(key, ablauf)}"


def oeffentliche_url(key: str) -> str | None:
    """Adresse für den Shop (veröffentlichte Shopbilder). Nur absolut sinnvoll:
    ohne Domain kann ein anderer Server das Bild nicht laden."""
    basis = _basis()
    if not basis.startswith(("http://", "https://")):
        return None
    return f"{basis}/{quote(key)}"
