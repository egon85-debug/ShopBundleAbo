"""Die Verwaltungsoberflaeche darf nach einem Update nicht aus dem Browser-Cache kommen."""


def test_admin_dateien_werden_immer_neu_geprueft(client):
    for pfad in ("/admin/", "/admin/app.js", "/admin/styles.css"):
        antwort = client.get(pfad)
        assert antwort.status_code == 200, pfad
        assert antwort.headers["cache-control"] == "no-cache", pfad
        assert antwort.headers.get("etag"), pfad
