package de.winterfeld.logistik

import android.content.Context
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.work.testing.WorkManagerTestInitHelper
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import de.winterfeld.logistik.data.remote.TokenStore
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.concurrent.CopyOnWriteArrayList

/** App mit einfacher Token-Ablage (Robolectric hat keinen Android-Schlüsselspeicher). */
class TestApp : WinterfeldApp() {
    override fun onCreate() {
        WorkManagerTestInitHelper.initializeTestWorkManager(this)
        super.onCreate()
    }
    override fun createContainer() = AppContainer(
        this, TokenStore(getSharedPreferences("test-tokens", Context.MODE_PRIVATE)))
}

/**
 * Hinweis: Dialoge mit Textfeld lassen sich unter Robolectric nicht testen —
 * dort geraet schon ein unveraenderter Material-Dialog mit OutlinedTextField in
 * eine endlose Layout-Schleife (auch im nativen Grafikmodus). Die
 * Auswahl-Dialoge und alles andere laufen hier echt durch.
 *
 * Startet die echte App (MainActivity, Navigation, Netzwerk) auf der JVM und
 * tippt sich durch alle Bildschirme. Der Server ist nachgebaut und antwortet mit
 * Antworten, die der echte Server geliefert hat (test/resources/server) — ein
 * Artikel ohne KI-Erkennung und einer mit.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = TestApp::class, sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class AppDurchklickTest {

    private val server = FakeServer()

    @get:Rule(order = 0)
    val serverRule = object : ExternalResource() {
        override fun before() {
            server.start()
            val tokens = ApplicationProvider.getApplicationContext<TestApp>().container.tokenStore
            tokens.baseUrl = server.url
            tokens.accessToken = "test-access"
            tokens.refreshToken = "test-refresh"
            // Ein Absturz vom letzten Mal, der schon auf dem Sicherheitsbildschirm
            // gezeigt wurde: die normale App schickt ihn beim Start an den Server.
            val context = ApplicationProvider.getApplicationContext<TestApp>()
            java.io.File(context.filesDir, "absturzbericht.txt")
                .writeText("Thread: main\n\njava.lang.X: kaputt")
            CrashReporter.alsGezeigtMerken(context)
        }
        override fun after() = server.stop()
    }

    @get:Rule(order = 1)
    val app = createAndroidComposeRule<MainActivity>()

    private fun warteAuf(text: String, substring: Boolean = false) = app.waitUntil(5_000) {
        app.onAllNodes(hasText(text, substring = substring)).fetchSemanticsNodes().isNotEmpty()
    }

    private fun tippe(text: String) {
        warteAuf(text)
        app.onNodeWithText(text).performClick()
        app.waitForIdle()
    }

    private fun zurueck() {
        app.runOnUiThread { app.activity.onBackPressedDispatcher.onBackPressed() }
        app.waitForIdle()
    }

    /** In der Artikelansicht zu einer Zeile scrollen und sie antippen. */
    private fun tippeImArtikel(text: String) {
        app.onNodeWithTag("artikel-detail").performScrollToNode(hasText(text))
        tippe(text)
    }

    @Test
    fun startseite_zeigt_zahlen_vom_server() {
        warteAuf("heute 2 neu erfasst")
        app.onNodeWithText("Artikel erfassen").assertExists()
    }

    @Test
    fun absturz_vom_letzten_mal_wird_gemeldet() {
        warteAuf("Der Fehlerbericht wurde an den Server geschickt", substring = true)
        assertTrue(server.anfragen.any { it.startsWith("POST /api/v1/client-errors") &&
                                         it.contains("java.lang.X: kaputt") })
        tippe("OK")
        app.waitUntil(5_000) { app.onAllNodes(hasText("Fehlerbericht", substring = true))
                                  .fetchSemanticsNodes().isEmpty() }
    }

    @Test
    fun artikel_ohne_erkennung_oeffnen_und_aendern() {
        tippe("Alle Artikel")
        tippe("Unbenannter Artikel")
        warteAuf("OFFENE FRAGEN")
        warteAuf("Ich konnte den Artikel nicht erkennen. Wie heißt er?")

        // Auswahl-Dialoge (ohne Texteingabe) ändern per PATCH
        tippeImArtikel("Zustand")
        tippe("Gebraucht")
        warteAuf("Gebraucht")
        assertTrue(server.anfragen.any { it.contains("\"condition\":\"used\"") })

        tippeImArtikel("Lagerplatz")
        tippe("H2-B-04 · Halle 2, Regal B, Fach 4")
        warteAuf("H2-B-04")
        assertTrue(server.anfragen.any { it.contains("\"storage_location_id\":\"loc-1\"") })

        tippeImArtikel("Lagerplatz")
        tippe("Kein Lagerplatz")
        app.waitUntil(5_000) { server.anfragen.any { it.contains("\"storage_location_id\":null") } }

        zurueck()
        warteAuf("Alle")   // Filterleiste der Liste
        zurueck()
        warteAuf("Artikel erfassen")
    }

    @Test
    fun erkannter_artikel_bis_ganz_unten() {
        tippe("Shopbereit")
        tippe("Bosch Professional GSR 12V-35")
        warteAuf("ARTIKEL")
        app.onNodeWithTag("artikel-detail").performScrollToNode(hasText("NOTIZEN"))
        app.onNodeWithTag("artikel-detail").performScrollToNode(
            hasText("Gesprochen bei der Aufnahme"))
        warteAuf("Müller Großhandel")
    }

    @Test
    fun alle_unterseiten_oeffnen_und_zurueck() {
        for (seite in listOf("Zu prüfen", "Veröffentlicht", "Lagerplätze", "Lieferanten",
                             "Synchronisierung", "Einstellungen")) {
            tippe(seite)
            zurueck()
            warteAuf("Artikel erfassen")
        }
        tippe("Lagerplätze")
        warteAuf("H2-B-04")
        zurueck()
        tippe("Einstellungen")
        warteAuf("App-Version")
    }

    @Test
    fun suche_schickt_suchbegriff() {
        tippe("Alle Artikel")
        warteAuf("Unbenannter Artikel")
        app.onNode(hasSetTextAction()).performTextInput("Bosch")
        app.waitUntil(5_000) { server.anfragen.any { it.contains("q=Bosch") } }
    }
}

/** Nachgebauter Server mit echten Antworten; merkt sich Änderungen und alle Anfragen. */
class FakeServer {
    private val web = MockWebServer()
    val anfragen = CopyOnWriteArrayList<String>()
    private val produkte = mutableMapOf<String, JsonObject>()
    val url: String get() = web.url("/").toString().trimEnd('/')

    private fun datei(name: String) =
        javaClass.getResource("/server/$name")!!.readText()

    fun start() {
        for (name in listOf("product_ohne_ki.json", "product_mit_ki.json")) {
            val p = JsonParser.parseString(datei(name)).asJsonObject
            produkte[p["id"].asString] = p
        }
        web.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val body = request.body.readUtf8()
                anfragen += "${request.method} ${request.path} $body"
                return antwort(request.method!!, request.requestUrl!!.encodedPath, body)
            }
        }
        web.start()
    }

    fun stop() = web.shutdown()

    private fun json(text: String) = MockResponse().setHeader("Content-Type", "application/json")
        .setBody(text)

    private fun antwort(method: String, path: String, body: String): MockResponse {
        val teile = path.removePrefix("/api/v1/").split("/")
        return when {
            path == "/api/v1/dashboard" -> json(datei("dashboard.json"))
            path == "/api/v1/client-errors" -> MockResponse().setResponseCode(204)
            path == "/api/v1/storage-locations" -> json(datei("locations.json"))
            path == "/api/v1/suppliers" -> json(datei("suppliers.json"))
            path == "/api/v1/products" -> json(liste())
            teile[0] == "products" && teile.size == 2 -> {
                val p = produkte[teile[1]] ?: return MockResponse().setResponseCode(404)
                if (method == "PATCH") aendern(p, JsonParser.parseString(body).asJsonObject)
                json(p.toString())
            }
            teile[0] == "captures" && teile.getOrNull(2) == "answers" -> {
                val p = produkte[teile[1]] ?: return MockResponse().setResponseCode(404)
                val antwort = JsonParser.parseString(body).asJsonObject["answers"]
                    .asJsonArray[0].asJsonObject
                val feld = antwort["field"].asString
                if (feld == "stock_quantity") {
                    p.addProperty("stock_quantity", antwort["value"].asString.toInt())
                    p.addProperty("available_quantity", antwort["value"].asString.toInt())
                } else p.add(feld, antwort["value"])
                val offen = p["open_questions"].asJsonArray
                offen.removeAll { it.asJsonObject["id"].asString == antwort["question_id"].asString }
                json(p.toString())
            }
            else -> MockResponse().setResponseCode(404)
        }
    }

    /** Wie der echte Server: Lagerplatz/Lieferant kommen als Code bzw. Name zurück. */
    private fun aendern(p: JsonObject, felder: JsonObject) {
        for ((key, value) in felder.entrySet()) {
            when (key) {
                "storage_location_id" -> p.addProperty("storage_location_code",
                    if (value.isJsonNull) null else "H2-B-04")
                "supplier_name" -> p.add("supplier_name", value)
                "supplier_id" -> p.addProperty("supplier_name", "Müller Großhandel")
                else -> p.add(key, value)
            }
        }
    }

    private fun liste(): String {
        val page = JsonParser.parseString(datei("list.json")).asJsonObject
        val items = page["items"].asJsonArray
        for (i in 0 until items.size()) {
            val id = items[i].asJsonObject["id"].asString
            produkte[id]?.let { items[i] = it }
        }
        return Gson().toJson(page)
    }
}
