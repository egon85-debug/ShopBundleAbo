package de.winterfeld.logistik

import de.winterfeld.logistik.capture.SprachAbfrage
import de.winterfeld.logistik.capture.SprachAbfrage.Ergebnis
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SprachAbfrageTest {

    private fun schritt(feld: String?) = SprachAbfrage.SCHRITTE.first { it.feld == feld }

    private fun wert(feld: String?, gesprochen: String): Any? =
        (SprachAbfrage.lesen(schritt(feld), gesprochen) as Ergebnis.Antwort).antwort.value

    @Test
    fun `Reihenfolge beginnt mit Lagerplatz und Bestand`() {
        assertEquals(listOf("Lagerplatz", "Bestand"), SprachAbfrage.SCHRITTE.take(2).map { it.titel })
    }

    @Test
    fun `Bestand als Ziffern oder Wort`() {
        assertEquals("8", wert("stock_quantity", "8 Stück"))
        assertEquals("12", wert("stock_quantity", "zwölf"))
        assertEquals("1", wert("stock_quantity", "ein Stück"))
        assertEquals("1000", wert("stock_quantity", "1.000"))
        assertTrue(SprachAbfrage.lesen(schritt("stock_quantity"), "blau") is Ergebnis.Unklar)
    }

    @Test
    fun `Zustand in eigenen Worten`() {
        assertEquals("new", wert("condition", "neu"))
        assertEquals("new_opened", wert("condition", "neu, geöffnet"))
        assertEquals("used", wert("condition", "Gebraucht"))
        assertEquals("defective", wert("condition", "ist kaputt"))
        assertNull(SprachAbfrage.zustand("grün"))
    }

    @Test
    fun `Preis in verschiedenen Schreibweisen`() {
        assertEquals("12.50", wert("purchase_price_net", "12,50 €"))
        assertEquals("12.50", wert("purchase_price_net", "12 Euro 50"))
        assertEquals("7.05", wert("purchase_price_net", "7 Euro 5"))
        assertEquals("3.00", wert("purchase_price_net", "drei Euro"))
        assertEquals("19.99", wert("purchase_price_net", "19.99"))
    }

    @Test
    fun `Verkaufspreis wird nach dem Einkaufspreis abgefragt und als Betrag gelesen`() {
        val titel = SprachAbfrage.SCHRITTE.map { it.titel }
        assertEquals(titel.indexOf("Einkaufspreis netto") + 1, titel.indexOf("Verkaufspreis"))
        assertEquals("24.90", wert("sale_price", "24,90 €"))
        assertEquals("15.00", wert("sale_price", "fünfzehn Euro"))
        val unklar = SprachAbfrage.lesen(schritt("sale_price"), "teuer")
        assertEquals(SprachAbfrage.Ergebnis.Unklar("Bitte einen Betrag sagen", "ansage_bitte_betrag"), unklar)
    }

    @Test
    fun `Lagerplatz geht roh an den Server`() {
        assertEquals("H2 A B4", wert("storage_location_spoken", "H2 A B4"))
    }

    @Test
    fun `Befehle gelten bei jeder Frage`() {
        val s = schritt("storage_location_spoken")
        assertEquals(Ergebnis.Weiter, SprachAbfrage.lesen(s, "weiter"))
        assertEquals(Ergebnis.Weiter, SprachAbfrage.lesen(s, "Überspringen"))
        assertEquals(Ergebnis.Zurueck, SprachAbfrage.lesen(s, "zurück"))
        assertEquals(Ergebnis.Fertig, SprachAbfrage.lesen(s, "Fertig."))
    }

    @Test
    fun `Weitere Angaben gehen als freier Text an die KI`() {
        val ergebnis = SprachAbfrage.lesen(schritt(null), "Hersteller Bosch, Karton beschädigt")
        assertEquals(Ergebnis.Freitext("Hersteller Bosch, Karton beschädigt"), ergebnis)
        assertEquals(Ergebnis.Weiter, SprachAbfrage.lesen(schritt(null), "nein"))
    }
}
