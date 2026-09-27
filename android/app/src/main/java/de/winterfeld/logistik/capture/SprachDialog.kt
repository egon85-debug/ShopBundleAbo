package de.winterfeld.logistik.capture

import android.content.Context
import android.content.Intent
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import de.winterfeld.logistik.R
import de.winterfeld.logistik.capture.SprachAbfrage.Ergebnis

/**
 * Führt die Sprachabfrage durch: Ansage abspielen (Audiodatei aus res/raw) →
 * Signalton → genau eine Antwort aufnehmen → nächste Frage.
 *
 * Die Ansagen sind fertige Audiodateien, damit es nicht auf die Sprachausgabe
 * des Handys ankommt. Die Aufnahme beginnt erst nach dem Signalton, damit
 * die Ansage nicht mit erkannt wird.
 *
 * Sprachbefehle bei jeder Frage: „weiter“ (überspringen), „zurück“, „fertig“.
 * Wird zweimal nichts verstanden, geht es mit der nächsten Frage weiter.
 * Fehler, die sich nicht von selbst lösen, landen sichtbar in [onFehler].
 */
class SprachDialog(
    private val context: Context,
    /** Aktuelle Frage (null = Abfrage beendet). */
    private val onFrage: (SprachAbfrage.Schritt?) -> Unit,
    /** true, solange das Mikrofon offen ist („Jetzt sprechen“). */
    private val onHoeren: (Boolean) -> Unit,
    /** Zwischenstand der Erkennung zur Anzeige. */
    private val onZwischenstand: (String) -> Unit,
    private val onErgebnis: (SprachAbfrage.Schritt, Ergebnis) -> Unit,
    private val onFehler: (String) -> Unit,
) {
    private val haupt = Handler(Looper.getMainLooper())
    private var spieler: MediaPlayer? = null
    private var erkenner: SpeechRecognizer? = null
    private var schritte: List<SprachAbfrage.Schritt> = SprachAbfrage.SCHRITTE
    private var index = 0
    private var versuche = 0
    private var neustarts = 0
    private var aktiv = false

    /** Beginnt die Abfrage von vorn. */
    fun start(schritte: List<SprachAbfrage.Schritt> = SprachAbfrage.SCHRITTE) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onFehler("Keine Spracherkennung auf diesem Gerät. Bitte die App „Google“ " +
                     "installieren bzw. aktualisieren und unter Einstellungen → " +
                     "Spracheingabe „Google“ wählen.")
            onFrage(null)
            return
        }
        aufraeumen()
        this.schritte = schritte
        index = 0
        versuche = 0
        aktiv = true
        fragen()
    }

    /** Aktuelle Frage auslassen (Knopf „Überspringen“). */
    fun ueberspringen() {
        if (!aktiv) return
        aufraeumen()
        naechste()
    }

    /** Bricht die Abfrage ab (Knopf „Stopp“ oder Verlassen der Kamera). */
    fun stop() {
        val warAktiv = aktiv
        aktiv = false
        aufraeumen()
        if (warAktiv) onFrage(null)
    }

    fun freigeben() = stop()

    private fun aufraeumen() {
        haupt.removeCallbacksAndMessages(null)
        spieler?.release()
        spieler = null
        erkenner?.destroy()
        erkenner = null
        onHoeren(false)
    }

    private fun fragen(ansage: String? = null) {
        if (!aktiv) return
        val schritt = schritte.getOrNull(index) ?: return beenden()
        onFrage(schritt)
        onZwischenstand("")
        neustarts = 0
        val folge = listOfNotNull(ansage, schritt.ansage)
        abspielen(folge) { abspielen(listOf("signalton")) { aufnehmen() } }
    }

    /** Spielt die Audiodateien nacheinander ab und ruft danach [weiter] auf. */
    private fun abspielen(namen: List<String>, weiter: () -> Unit) {
        if (!aktiv) return
        val name = namen.firstOrNull() ?: return weiter()
        val rest = namen.drop(1)
        val id = AUDIO[name]
        val player = id?.let { runCatching { MediaPlayer.create(context, it) }.getOrNull() }
        if (player == null) {
            // Datei fehlt oder Audio gestört: Frage steht auf dem Bildschirm, weiter.
            haupt.postDelayed({ abspielen(rest, weiter) }, 200)
            return
        }
        spieler?.release()
        spieler = player
        player.setOnCompletionListener {
            it.release()
            if (spieler === it) spieler = null
            haupt.post { abspielen(rest, weiter) }
        }
        player.setOnErrorListener { mp, _, _ ->
            mp.release()
            if (spieler === mp) spieler = null
            haupt.post { abspielen(rest, weiter) }
            true
        }
        player.start()
    }

    private fun aufnehmen() {
        if (!aktiv) return
        erkenner?.destroy()
        erkenner = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle) {
                    val text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    haupt.post { onHoeren(false); verarbeiten(text) }
                }

                override fun onPartialResults(partialResults: Bundle) {
                    partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()?.let { haupt.post { onZwischenstand(it) } }
                }

                override fun onError(error: Int) {
                    haupt.post { onHoeren(false); fehler(error) }
                }

                override fun onReadyForSpeech(params: Bundle?) { haupt.post { onHoeren(true) } }
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            startListening(
                Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                             RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
                },
            )
        }
    }

    private fun fehler(code: Int) {
        if (!aktiv) return
        when (code) {
            SpeechRecognizer.ERROR_NO_MATCH,
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> nichtVerstanden(SprachAbfrage.ANSAGE_NICHT_VERSTANDEN)
            // Erkennung noch belegt (z. B. von der vorigen Frage): kurz warten, neu starten.
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
            SpeechRecognizer.ERROR_CLIENT -> if (neustarts++ < 2) {
                erkenner?.destroy(); erkenner = null
                haupt.postDelayed({ aufnehmen() }, 600)
            } else abbrechen("Die Spracherkennung reagiert nicht (Code $code). Bitte erneut starten.")
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                abbrechen("Die App darf das Mikrofon nicht benutzen. Bitte in den Android-" +
                          "Einstellungen → Apps → Winterfeld Lager → Berechtigungen das Mikrofon erlauben.")
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
            SpeechRecognizer.ERROR_SERVER ->
                abbrechen("Die Spracherkennung braucht eine Internetverbindung (Code $code).")
            ERROR_SPRACHE_FEHLT, ERROR_SPRACHE_NICHT_VERFUEGBAR ->
                abbrechen("Deutsch fehlt in der Spracherkennung. Bitte unter Einstellungen → " +
                          "Spracheingabe → Google → Offline-Spracherkennung „Deutsch“ laden.")
            else -> abbrechen("Spracherkennung fehlgeschlagen (Code $code).")
        }
    }

    private fun abbrechen(meldung: String) {
        stop()
        onFehler(meldung)
    }

    private fun verarbeiten(text: String) {
        if (!aktiv) return
        val schritt = schritte.getOrNull(index) ?: return beenden()
        if (text.isBlank()) return nichtVerstanden(SprachAbfrage.ANSAGE_NICHT_VERSTANDEN)
        when (val ergebnis = SprachAbfrage.lesen(schritt, text)) {
            is Ergebnis.Unklar -> nichtVerstanden(ergebnis.ansage)
            Ergebnis.Fertig -> beenden()
            Ergebnis.Zurueck -> { index = (index - 1).coerceAtLeast(0); versuche = 0; fragen() }
            Ergebnis.Weiter -> naechste()
            else -> { onErgebnis(schritt, ergebnis); naechste() }
        }
    }

    private fun nichtVerstanden(ansage: String) {
        if (versuche++ >= 1) naechste() else fragen(ansage)
    }

    private fun naechste() {
        index++
        versuche = 0
        if (index < schritte.size) fragen() else beenden()
    }

    private fun beenden() {
        if (!aktiv) return
        erkenner?.destroy()
        erkenner = null
        onHoeren(false)
        onFrage(null)
        // Abschluss ansagen, danach ist die Abfrage vorbei.
        abspielen(listOf(SprachAbfrage.ANSAGE_FERTIG)) { aktiv = false }
    }

    companion object {
        // Erst ab Android 12/13 als Konstanten vorhanden.
        private const val ERROR_SPRACHE_FEHLT = 12
        private const val ERROR_SPRACHE_NICHT_VERFUEGBAR = 13

        private val AUDIO = mapOf(
            "ansage_lagerplatz" to R.raw.ansage_lagerplatz,
            "ansage_bestand" to R.raw.ansage_bestand,
            "ansage_zustand" to R.raw.ansage_zustand,
            "ansage_einkaufspreis" to R.raw.ansage_einkaufspreis,
            "ansage_weitere" to R.raw.ansage_weitere,
            "ansage_nicht_verstanden" to R.raw.ansage_nicht_verstanden,
            "ansage_bitte_zahl" to R.raw.ansage_bitte_zahl,
            "ansage_bitte_zustand" to R.raw.ansage_bitte_zustand,
            "ansage_bitte_betrag" to R.raw.ansage_bitte_betrag,
            "ansage_fertig" to R.raw.ansage_fertig,
            "signalton" to R.raw.signalton,
        )
    }
}
