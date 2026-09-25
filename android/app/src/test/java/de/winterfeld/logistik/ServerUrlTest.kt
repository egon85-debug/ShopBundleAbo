package de.winterfeld.logistik

import de.winterfeld.logistik.data.remote.ServerUrl
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response
import java.net.UnknownHostException

class ServerUrlTest {

    private val ziel = "https://lager.winterfeld-logistik.de"

    @Test
    fun `so wie es auf dem Handy eingetippt wird`() {
        for (eingabe in listOf(
            "https://lager.winterfeld-logistik.de",
            "https://lager.winterfeld-logistik.de/",
            "  https://lager.winterfeld-logistik.de/  ",
            "lager.winterfeld-logistik.de",
            "lager.winterfeld-logistik.de/",
            "https://lager.winterfeld-logistik.de/api/v1",
            "https://lager.winterfeld-logistik.de/api/v1/",
        )) {
            assertEquals("Eingabe: '$eingabe'", ziel, ServerUrl.normalize(eingabe))
        }
    }

    @Test
    fun `http bleibt http - fuer einen Server im eigenen Netz`() {
        assertEquals("http://192.168.178.34:8000",
                     ServerUrl.normalize("http://192.168.178.34:8000/"))
    }

    @Test
    fun `leere Eingabe bleibt leer`() {
        assertEquals("", ServerUrl.normalize("   "))
    }

    @Test
    fun `verstaendliche Meldungen statt HTTP-Codes`() {
        fun http(code: Int) = HttpException(Response.error<Any>(code, "".toResponseBody(null)))
        assertEquals("E-Mail oder Passwort falsch.", ServerUrl.anmeldeFehler(http(401)))
        assertTrue(ServerUrl.anmeldeFehler(http(404)).contains("Adresse prüfen"))
        assertTrue(ServerUrl.anmeldeFehler(http(429)).contains("Minute"))
        assertTrue(ServerUrl.anmeldeFehler(UnknownHostException("x")).contains("nicht gefunden"))
    }
}
