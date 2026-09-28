package de.winterfeld.logistik

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ResolveInfo
import android.content.pm.ServiceInfo
import android.os.Bundle
import android.speech.RecognitionService
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.test.core.app.ApplicationProvider
import de.winterfeld.logistik.capture.SprachAbfrage
import de.winterfeld.logistik.capture.SprachDialog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadow.api.Shadow
import org.robolectric.shadows.ShadowLooper
import org.robolectric.shadows.ShadowSpeechRecognizer

/**
 * Ablauf der Sprachabfrage mit nachgestellten Fehlern der Spracherkennung.
 * Auslöser: Auf einem Handy brach die Abfrage nach der ersten Frage mit
 * Fehler 11 (Verbindung abgerissen) ab – auch nach „Erneut versuchen“.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = TestApp::class)
class SprachDialogTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val antworten = mutableListOf<Pair<String, SprachAbfrage.Ergebnis>>()
    private val fehler = mutableListOf<String>()
    private var systemFenster: Pair<Intent, (List<String>?) -> Unit>? = null

    private fun dialog(mitSystemFenster: Boolean = true) = SprachDialog(
        context,
        onFrage = {},
        onHoeren = {},
        onZwischenstand = {},
        onErgebnis = { schritt, ergebnis -> antworten += schritt.titel to ergebnis },
        onFehler = { fehler += it },
        systemErkennung = if (mitSystemFenster) { intent, fertig -> systemFenster = intent to fertig } else null,
    )

    @Before
    fun spracherkennungVorhanden() {
        ShadowSpeechRecognizer.reset()
        context.getSharedPreferences("sprachabfrage", Context.MODE_PRIVATE).edit().clear().commit()
        // Ohne registrierten Erkennungsdienst meldet Android „keine Spracherkennung“.
        val info = ResolveInfo().apply {
            serviceInfo = ServiceInfo().apply { packageName = "com.google.android.tts"; name = "Erkennung" }
        }
        shadowOf(context.packageManager).addResolveInfoForIntent(Intent(RecognitionService.SERVICE_INTERFACE), info)
        shadowOf(context.packageManager).addServiceIfNotPresent(ComponentName("com.google.android.tts", "Erkennung"))
    }

    /** Ansagen und Signalton ablaufen lassen, bis die Erkennung zuhört. */
    private fun weiter(sekunden: Long = 3) = ShadowLooper.idleMainLooper(sekunden, java.util.concurrent.TimeUnit.SECONDS)

    private fun erkenner(): SpeechRecognizer = ShadowSpeechRecognizer.getLatestSpeechRecognizer()
    private fun shadow(sr: SpeechRecognizer): ShadowSpeechRecognizer = Shadow.extract(sr)

    private fun sagt(sr: SpeechRecognizer, text: String) {
        shadow(sr).triggerOnResults(Bundle().apply {
            putStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION, arrayListOf(text))
        })
        weiter(0)
    }

    @Test
    fun jedeFrageBekommtEineFrischeVerbindung() {
        dialog().start()
        weiter()
        val erste = erkenner()
        sagt(erste, "A 01 03")
        assertTrue("Verbindung nach der Antwort geschlossen", shadow(erste).isDestroyed)

        weiter()
        val zweite = erkenner()
        assertNotSame(erste, zweite)
        sagt(zweite, "acht")

        assertEquals(listOf("Lagerplatz", "Bestand"), antworten.map { it.first })
        assertTrue(fehler.isEmpty())
    }

    @Test
    fun beiFehler11ErstNeuversuchDannGoogleFenster() {
        dialog().start()
        weiter()
        sagt(erkenner(), "A 01 03")

        // Zweite Frage: Verbindung reißt ab …
        weiter()
        shadow(erkenner()).triggerOnError(11)
        weiter(0)
        assertTrue("noch kein Fenster vor dem Neuversuch", systemFenster == null)

        // … Neuversuch mit frischer Verbindung reißt ebenfalls ab …
        weiter()
        shadow(erkenner()).triggerOnError(11)
        weiter(0)

        // … dann übernimmt das Google-Sprachfenster dieselbe Frage.
        val (intent, fertig) = checkNotNull(systemFenster) { "Google-Sprachfenster nicht gestartet" }
        assertEquals(RecognizerIntent.ACTION_RECOGNIZE_SPEECH, intent.action)
        assertEquals("Bestand", intent.getStringExtra(RecognizerIntent.EXTRA_PROMPT))
        fertig(listOf("acht"))
        weiter(0)

        assertEquals(listOf("Lagerplatz", "Bestand"), antworten.map { it.first })
        assertTrue("kein Abbruch", fehler.isEmpty())

        // Die nächste Frage läuft direkt im Google-Fenster weiter.
        systemFenster = null
        weiter()
        assertEquals("Zustand", checkNotNull(systemFenster).first.getStringExtra(RecognizerIntent.EXTRA_PROMPT))

        // Das Handy merkt sich den Weg für die nächste Abfrage.
        assertTrue(context.getSharedPreferences("sprachabfrage", Context.MODE_PRIVATE)
                       .getBoolean("systemfenster", false))
    }

    @Test
    fun ohneGoogleFensterSichtbarerFehlerStattStillemAbbruch() {
        dialog(mitSystemFenster = false).start()
        weiter()
        shadow(erkenner()).triggerOnError(11)
        weiter()
        shadow(erkenner()).triggerOnError(11)
        weiter(0)
        assertEquals(1, fehler.size)
        assertTrue(fehler.single().contains("Code 11"))
    }
}
