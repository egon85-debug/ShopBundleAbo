"""Die Android-App vom eigenen Server: holen, pruefen, mit Wiederaufnahme ausliefern."""
import hashlib

import httpx
import pytest

from app.services import app_download

APK = b"PK\x03\x04" + b"x" * 5000


def _github(apk=APK, groesse=None, digest=None, privat=False):
    def antwort(request: httpx.Request) -> httpx.Response:
        if privat and request.headers.get("Authorization") != "Bearer geheim":
            return httpx.Response(404)
        if request.url.path.endswith("/releases/latest"):
            return httpx.Response(200, json={"tag_name": "app-1.0.47", "assets": [
                {"name": "winterfeld-lager-1.0.47.apk", "size": groesse or len(apk),
                 "digest": digest or "sha256:" + hashlib.sha256(apk).hexdigest(),
                 "url": "https://api.github.example/repos/x/releases/assets/1",
                 "browser_download_url": "https://github.example/app.apk"}]})
        return httpx.Response(200, content=apk)
    return httpx.Client(transport=httpx.MockTransport(antwort))


@pytest.fixture(autouse=True)
def speicher(tmp_path, monkeypatch):
    from app.config import get_settings
    monkeypatch.setattr(get_settings(), "storage_local_path", str(tmp_path))


def test_holen_und_ausliefern(client):
    assert client.get("/app").status_code == 404

    info = app_download.holen(client=_github(), token="")
    assert info["version"] == "1.0.47"

    res = client.get("/app")
    assert res.status_code == 200
    assert res.content == APK
    assert res.headers["content-type"] == "application/vnd.android.package-archive"
    assert "winterfeld-lager-1.0.47.apk" in res.headers["content-disposition"]

    # Download-Manager fragen zuerst per HEAD nach Groesse und Wiederaufnahme
    kopf = client.head("/app")
    assert kopf.status_code == 200
    assert kopf.headers["content-length"] == str(len(APK))
    assert kopf.headers["accept-ranges"] == "bytes"
    assert kopf.content == b""

    # Abgebrochener Download laesst sich fortsetzen
    teil = client.get("/app", headers={"Range": "bytes=1000-"})
    assert teil.status_code == 206
    assert teil.content == APK[1000:]


def test_unvollstaendiger_download_wird_verworfen():
    with pytest.raises(RuntimeError, match="unvollstaendig"):
        app_download.holen(client=_github(groesse=len(APK) + 1), token="")
    assert app_download.bereitgestellt() is None


def test_falsche_pruefsumme_wird_verworfen():
    with pytest.raises(RuntimeError, match="Pruefsumme"):
        app_download.holen(client=_github(digest="sha256:" + "0" * 64), token="")
    assert app_download.bereitgestellt() is None


def test_privates_repository_braucht_token():
    with pytest.raises(RuntimeError, match="GITHUB_TOKEN"):
        app_download.holen(client=_github(privat=True), token="")
    info = app_download.holen(client=_github(privat=True), token="geheim")
    assert info["size"] == len(APK)
