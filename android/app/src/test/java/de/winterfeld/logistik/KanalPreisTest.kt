package de.winterfeld.logistik

import com.google.gson.Gson
import de.winterfeld.logistik.data.remote.dto.KanaeleRequest
import de.winterfeld.logistik.data.remote.dto.KanalDto
import de.winterfeld.logistik.ui.components.euro
import de.winterfeld.logistik.ui.components.preisEingabe
import de.winterfeld.logistik.ui.components.preisRegel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Preise je Vertriebskanal: Anzeige, Eingabe und was an den Server geht. */
class KanalPreisTest {

    private val gson = Gson()

    private fun kanal(aufschlag: String? = "0.00", runden: Boolean? = false, fest: String? = null) =
        KanalDto("k1", "eBay", "ebay", "eBay", false, aufschlag, runden, "66.99", fest)

    @Test
    fun `preis je kanal wird gelesen`() {
        val k = gson.fromJson("""{"id": "k1", "name": "eBay", "connector_type": "ebay",
            "portal": "eBay", "manuell": false, "preis_aufschlag": "12.00", "preis_runden": true,
            "preis": "66.99", "preis_fest": null}""", KanalDto::class.java)
        assertEquals("66.99", k.preis)
        assertEquals("Verkaufspreis + 12 %, auf ,99", preisRegel(k))
        // Ältere Server kennen die Preisfelder nicht.
        val alt = gson.fromJson("""{"id": "k1", "name": "eBay", "connector_type": "ebay",
            "portal": "eBay", "manuell": false}""", KanalDto::class.java)
        assertNull(alt.preis)
        assertEquals("Verkaufspreis", preisRegel(alt))
    }

    @Test
    fun `preisregel in worten`() {
        assertEquals("fester Preis", preisRegel(kanal(fest = "50.00")))
        assertEquals("Verkaufspreis + 7,5 %", preisRegel(kanal(aufschlag = "7.50")))
        assertEquals("Verkaufspreis − 10 %", preisRegel(kanal(aufschlag = "-10.00")))
        assertEquals("Verkaufspreis, auf ,99", preisRegel(kanal(runden = true)))
    }

    @Test
    fun `preiseingabe versteht deutsche schreibweise`() {
        assertEquals("12.99", preisEingabe("12,99"))
        assertEquals("1234.50", preisEingabe("1.234,5 €"))
        assertEquals("", preisEingabe("  "))
        assertNull(preisEingabe("abc"))
        assertNull(preisEingabe("0"))
        assertEquals("66,99 €", euro("66.99").replace(' ', ' '))
    }

    @Test
    fun `fester preis wird mitgeschickt, leer heisst aufschlag`() {
        assertEquals("""{"connection_ids":["k1"],"preise":{"k1":"12.99"}}""",
                     gson.toJson(KanaeleRequest(listOf("k1"), mapOf("k1" to "12.99"))))
        assertEquals("""{"connection_ids":["k1"],"preise":{"k1":""}}""",
                     gson.toJson(KanaeleRequest(listOf("k1"), mapOf("k1" to ""))))
        assertEquals("""{"connection_ids":["k1"]}""", gson.toJson(KanaeleRequest(listOf("k1"))))
    }
}
