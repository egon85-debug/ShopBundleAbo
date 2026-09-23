"""Die Android-App vom eigenen Server ausliefern.

Auf dem Handy bricht der Download von GitHub gern ab: bei einem privaten
Repository gibt GitHub nur einen signierten Link heraus, der nach wenigen
Minuten ablaeuft — im Mobilnetz sind 24 MB bis dahin oft nicht unten.
Der Server holt das APK der neuesten Version einmal selbst, prueft Groesse und
Pruefsumme und stellt es unter /app bereit. Von dort laesst es sich mit
Wiederaufnahme laden (HTTP-Range), falls die Verbindung abreisst.

Fuer ein privates Repository braucht der Server GITHUB_TOKEN in der .env: ein
fine-grained Token nur fuer dieses Repository, Berechtigung "Contents: Read".
"""
import hashlib
import json
from pathlib import Path

import httpx

from app.config import get_settings

GITHUB_API = "https://api.github.com"
STANDARD_REPO = "egon85-debug/Winterfeld-Logistik"


def apk_pfad() -> Path:
    return Path(get_settings().storage_local_path) / "app" / "winterfeld-lager.apk"


def info_pfad() -> Path:
    return apk_pfad().with_suffix(".json")


def bereitgestellt() -> dict | None:
    """Version und Groesse des bereitgestellten APK, sonst None."""
    if not apk_pfad().exists() or not info_pfad().exists():
        return None
    return json.loads(info_pfad().read_text())


def holen(repo: str = STANDARD_REPO, client: httpx.Client | None = None,
          token: str | None = None) -> dict:
    """Laedt das APK der neuesten Release und legt es geprueft ab."""
    token = token if token is not None else get_settings().github_token
    auth = {"Authorization": f"Bearer {token}"} if token else {}
    eigener = client is None
    # httpx laesst den Authorization-Kopf bei der Weiterleitung auf einen
    # anderen Host (GitHubs signierter Download-Link) von selbst weg.
    client = client or httpx.Client(timeout=120, follow_redirects=True)
    try:
        antwort = client.get(f"{GITHUB_API}/repos/{repo}/releases/latest",
                             headers={"Accept": "application/vnd.github+json", **auth})
        if antwort.status_code == 404:
            raise RuntimeError(
                "GitHub kennt das Repository nicht — bei einem privaten Repository "
                "GITHUB_TOKEN in der .env setzen (nur Lesezugriff auf Contents)")
        if antwort.status_code == 401:
            raise RuntimeError("GITHUB_TOKEN ist ungueltig oder abgelaufen")
        antwort.raise_for_status()
        release = antwort.json()
        asset = next((a for a in release.get("assets", [])
                      if a["name"].endswith(".apk")), None)
        if asset is None:
            raise RuntimeError(f"Release {release.get('tag_name')} enthaelt kein APK")

        ziel = apk_pfad()
        ziel.parent.mkdir(parents=True, exist_ok=True)
        tmp = ziel.with_suffix(".part")
        sha = hashlib.sha256()
        # Ueber die API (asset["url"]) klappt es auch bei privaten Repositories.
        quelle = asset.get("url") or asset["browser_download_url"]
        with client.stream("GET", quelle,
                           headers={"Accept": "application/octet-stream", **auth}) as download:
            download.raise_for_status()
            with tmp.open("wb") as datei:
                for stueck in download.iter_bytes():
                    datei.write(stueck)
                    sha.update(stueck)

        groesse = tmp.stat().st_size
        if groesse != asset["size"]:
            tmp.unlink()
            raise RuntimeError(f"Download unvollstaendig: {groesse} von {asset['size']} Bytes")
        erwartet = (asset.get("digest") or "").removeprefix("sha256:")
        if erwartet and sha.hexdigest() != erwartet:
            tmp.unlink()
            raise RuntimeError("Pruefsumme stimmt nicht — Datei verworfen")

        tmp.replace(ziel)
        info = {"version": release.get("tag_name", "").removeprefix("app-"),
                "name": asset["name"], "size": groesse, "sha256": sha.hexdigest()}
        info_pfad().write_text(json.dumps(info))
        return info
    finally:
        if eigener:
            client.close()
