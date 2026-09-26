"""Shoptexte sind für Kunden: keine Prüf-/Foto-Vorbehalte, keine internen Angaben."""
from app.services.listing_service import bereinigen, split_fields, stichpunkte_bereinigen
from app.models import Product

COLA = (
    "<p>Coca-Cola Original Taste von Coca-Cola Europacific Partners DE ist das klassische "
    "koffeinhaltige Erfrischungsgetränk der Marke Coca-Cola. Angeboten wird ein 6er Träger.</p>"
    "<ul><li>Marke: Coca-Cola</li><li>Produkt: Original Taste</li>"
    "<li>Kategorie: Getränke / Erfrischungsgetränk (Cola)</li><li>Gebinde: 6er Träger</li></ul>"
    "<p>Einzelne Flaschen im Träger können mit einer Fußball-/Bundesliga-Grafik sowie einem "
    "QR-Code auf dem Etikett versehen sein; dies ist jedoch nicht für den gesamten Träger "
    "bestätigt.</p>"
    "<p>Nährwerte je 100 ml (Aufdruck): Energie 180 kJ / 42 kcal, Fett 0 g, Kohlenhydrate "
    "10,6 g (davon Zucker 10,6 g), Eiweiß 0 g, Salz 0 g. Je 250 ml Portion: 450 kJ / 105 kcal.</p>"
    "<p>Der genaue Zustand der Flaschen wurde nicht vollständig geprüft. Auf einem vorliegenden "
    "Foto sind am Flaschenhals leichte Verschmutzungen bzw. Rückstände sichtbar, die Flasche "
    "wirkt ansonsten intakt und gefüllt.</p>"
)


def test_cola_text_verliert_vorbehalte_und_interna_aber_nicht_den_inhalt():
    sauber = bereinigen(COLA)
    for verboten in ("nicht für den gesamten Träger bestätigt", "nicht vollständig geprüft",
                     "vorliegenden Foto", "(Aufdruck)", "Kategorie:", "versehen sein",
                     "Rückstände", "wirkt ansonsten"):
        assert verboten not in sauber, verboten
    for bleibt in ("klassische koffeinhaltige Erfrischungsgetränk", "Angeboten wird ein 6er Träger.",
                   "<li>Gebinde: 6er Träger</li>", "Nährwerte je 100 ml: Energie 180 kJ / 42 kcal",
                   "Je 250 ml Portion: 450 kJ / 105 kcal."):
        assert bleibt in sauber, bleibt
    assert "<p></p>" not in sauber


def test_stichpunkte_ohne_kategorie_und_vorbehalt():
    assert stichpunkte_bereinigen(
        ["Kategorie: Getränke", "Füllmenge 6 × 1,0 l", "Etikett laut Foto beschädigt", "Koffeinhaltig"]
    ) == ["Füllmenge 6 × 1,0 l", "Koffeinhaltig"]


def test_klartext_und_leere_werte():
    assert bereinigen(None) is None
    assert bereinigen("Leichte Gebrauchsspuren. Zustand wurde nicht geprüft.") == "Leichte Gebrauchsspuren."
    assert bereinigen("Auf dem Foto sieht man Kratzer.") is None


def test_interne_bemerkungen_gehen_nicht_an_die_ki():
    produkt = Product(internal_sku="WL-1", product_name="Cola", notes="Flaschenhals verschmutzt, prüfen",
                      field_sources={"product_name": "user", "notes": "user"}, field_confidence={})
    verifiziert, unverifiziert = split_fields(produkt)
    assert "notes" not in verifiziert and "notes" not in unverifiziert


def test_abkuerzungen_trennen_keine_saetze():
    text = "Mit Koffer, Akku bzw. Ladegerät. Auf dem Foto sind Kratzer bzw. Dellen sichtbar. Sofort einsatzbereit."
    assert bereinigen(text) == "Mit Koffer, Akku bzw. Ladegerät. Sofort einsatzbereit."
