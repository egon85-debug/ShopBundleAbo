package de.winterfeld.logistik

import de.winterfeld.logistik.data.remote.dto.ImageDto
import de.winterfeld.logistik.data.repo.patchBody
import de.winterfeld.logistik.ui.components.Labels
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class LabelsTest {

    @Test
    fun `Preise werden deutsch angezeigt`() {
        assertEquals("12,50 €", Labels.preis("12.5"))
        assertEquals("1.234,00 €", Labels.preis("1234"))
        assertEquals("–", Labels.preis(null))
        assertEquals("–", Labels.preis("kaputt"))
    }

    @Test
    fun `Preis-Eingabe vom Handy wird zum Serverformat`() {
        assertEquals("12.50", Labels.preisEingabe("12,50"))
        assertEquals("12.50", Labels.preisEingabe("12.5"))
        assertEquals("1234.50", Labels.preisEingabe("1.234,50 €"))
        assertEquals("7.00", Labels.preisEingabe(" 7 "))
        assertNull("leer heißt Feld leeren", Labels.preisEingabe(""))
        assertThrows(IllegalArgumentException::class.java) { Labels.preisEingabe("zwölf") }
        assertThrows(IllegalArgumentException::class.java) { Labels.preisEingabe("-3") }
    }

    @Test
    fun `Bildadressen vom Server werden vollstaendig`() {
        val base = "https://lager.winterfeld-logistik.de"
        assertEquals("$base/api/v1/media/a.jpg", Labels.bildUrl(base, "/api/v1/media/a.jpg"))
        assertEquals("$base/api/v1/media/a.jpg", Labels.bildUrl("$base/", "api/v1/media/a.jpg"))
        assertEquals("https://cdn.example/a.jpg", Labels.bildUrl(base, "https://cdn.example/a.jpg"))
        assertNull(Labels.bildUrl(base, null))
    }

    @Test
    fun `Vorschaubild ist das bearbeitete Hauptbild`() {
        val bilder = listOf(
            ImageDto("1", "original", "front", "/o1.jpg", true),
            ImageDto("2", "optimized", "front", "/p1.jpg", true),
            ImageDto("3", "original", "back", "/o2.jpg", false),
        )
        assertEquals("2", Labels.vorschaubild(bilder)?.id)
        assertEquals("1", Labels.vorschaubild(bilder.take(1))?.id)
        assertNull(Labels.vorschaubild(emptyList()))
        // Galerie: Hauptbilder zuerst, dort das Original vor der Bearbeitung.
        assertEquals(listOf("1", "2", "3"), Labels.galerie(bilder.reversed()).map { it.id })
    }

    @Test
    fun `Zustand auf Deutsch`() {
        assertEquals("Neu, geöffnet", Labels.zustand("new_opened"))
        assertEquals("irgendwas", Labels.zustand("irgendwas"))
    }

    @Test
    fun `PATCH schickt null mit, damit Felder geleert werden koennen`() {
        val buffer = Buffer()
        patchBody(mapOf("ean" to null, "sale_price" to "9.90")).writeTo(buffer)
        assertEquals("""{"ean":null,"sale_price":"9.90"}""", buffer.readUtf8())
    }
}
