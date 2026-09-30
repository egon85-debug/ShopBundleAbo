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
 *
 * Zwei Wege zur Erkennung:
 * - **In der App** ([SpeechRecognizer]): für jede Frage eine frische Verbindung,
 *   die nach der Antwort sofort geschlossen wird. Manche Handys trennen die
 *   Verbindung nach jeder Antwort; eine weiterverwendete Verbindung scheitert
 *   dann ab der zweiten Frage mit Fehler 11.
 * - **Google-Sprachfenster** ([systemErkennung]): Reißt die Verbindung auch
 *   nach einem Neuversuch ab, übernimmt die Spracheingabe von Google in ihrem
 *   eigenen Fenster (mit eigenem Signalton). Das Handy merkt sich das.
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
    /**
     * Startet das Google-Sprachfenster mit [Intent] und liefert die erkannten
     * Texte (null = abgebrochen bzw. nichts verstanden). null = nicht verfügbar.
     */
    private val systemErkennung: ((Intent, (List<String>?) -> Unit) -> Unit)? = null,
) {
    private val einstellungen = context.getSharedPreferences("sprachabfrage", Context.MODE_PRIVATE)
    /** true = dieses Handy nutzt das Google-Sprachfenster statt der Erkennung in der App. */
    private var imSystemFenster = einstellungen.getBoolean(SYSTEMFENSTER, false)
    private var wartetAufSystemFenster = false
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
        if (!imSystemFenster && !SpeechRecognizer.isRecognitionAvailable(context)) {
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

    /** Ansage und Aufnahme anhalten, Verbindung zur Erkennung schließen. */
    private fun aufraeumen() {
        haupt.removeCallbacksAndMessages(null)
        spieler?.release()
        spieler = null
        erkennerWeg()
        wartetAufSystemFenster = false
        onHoeren(false)
    }

    private fun erkennerWeg() {
        erkenner?.let { runCatching { it.cancel(); it.destroy() } }
        erkenner = null
    }

    private fun fragen(ansage: String? = null) {
        if (!aktiv) return
        val schritt = schritte.getOrNull(index) ?: return beenden()
        onFrage(schritt)
        onZwischenstand("")
        neustarts = 0
        val folge = listOfNotNull(ansage, schritt.ansage)
        // Das Google-Sprachfenster gibt selbst einen Signalton.
        if (imSystemFenster) abspielen(folge) { aufnehmen() }
        else abspielen(folge) { abspielen(listOf("signalton")) { aufnehmen() } }
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

    private fun erkennungsIntent() = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, context.packageName)
    }

    private fun aufnehmen() {
        if (!aktiv) return
        if (imSystemFenster) return imSystemFensterAufnehmen()
        // Für jede Frage eine frische Verbindung (siehe Klassenbeschreibung).
        erkennerWeg()
        erkennerNeu().startListening(erkennungsIntent())
    }

    private fun imSystemFensterAufnehmen() {
        val starten = systemErkennung ?: return abbrechen(
            "Die Spracherkennung des Handys antwortet nicht. Bitte die App „Google“ aktualisieren.")
        val schritt = schritte.getOrNull(index) ?: return beenden()
        wartetAufSystemFenster = true
        val intent = erkennungsIntent().apply {
            putExtra(RecognizerIntent.EXTRA_PROMPT, schritt.titel)
        }
        runCatching {
            starten(intent) { texte ->
                haupt.post {
                    if (!aktiv || !wartetAufSystemFenster) return@post
                    wartetAufSystemFenster = false
                    val text = texte?.firstOrNull().orEmpty()
                    if (text.isBlank()) nichtVerstanden(SprachAbfrage.ANSAGE_NICHT_VERSTANDEN)
                    else verarbeiten(text)
                }
            }
        }.onFailure {
            wartetAufSystemFenster = false
            abbrechen("Das Google-Sprachfenster lässt sich nicht öffnen. Bitte die App " +
                      "„Google“ installieren bzw. aktualisieren.")
        }
    }

    /** Frische Spracherkennung; ihre Rückrufe zählen nur, solange sie die aktuelle ist. */
    private fun erkennerNeu(): SpeechRecognizer {
        val neu = SpeechRecognizer.createSpeechRecognizer(context)
        neu.setRecognitionListener(object : RecognitionListener {
            // Rückrufe einer inzwischen ersetzten Erkennung zählen nicht mehr.
            private fun aktuell() = erkenner === neu

            override fun onResults(results: Bundle) {
                val text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull().orEmpty()
                haupt.post { if (aktuell()) { onHoeren(false); erkennerWeg(); verarbeiten(text) } }
            }

            override fun onPartialResults(partialResults: Bundle) {
                partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()?.let { haupt.post { if (aktuell()) onZwischenstand(it) } }
            }

            override fun onError(error: Int) {
                haupt.post { if (aktuell()) { onHoeren(false); erkennerWeg(); fehler(error) } }
            }

            override fun onReadyForSpeech(params: Bundle?) {
                haupt.post { if (aktuell()) onHoeren(true) }
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        erkenner = neu
        return neu
    }

    private fun fehler(code: Int) {
        if (!aktiv) return
        when (code) {
            SpeechRecognizer.ERROR_NO_MATCH,
            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> nichtVerstanden(SprachAbfrage.ANSAGE_NICHT_VERSTANDEN)
            // Verbindung zum Erkennungsdienst abgerissen (11), Dienst belegt (8),
            // zu viele Anfragen (10) oder Client-Fehler (5): einmal mit frischer
            // Verbindung nach kurzer Pause, danach das Google-Sprachfenster –
            // dieselbe Frage, ohne erneute Ansage.
            ERROR_VERBINDUNG_WEG, ERROR_ZU_VIELE_ANFRAGEN,
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY,
            SpeechRecognizer.ERROR_CLIENT -> when {
                neustarts++ < 1 -> haupt.postDelayed({ tonUndAufnehmen() }, 1500L)
                systemErkennung != null -> {
                    imSystemFenster = true
                    einstellungen.edit().putBoolean(SYSTEMFENSTER, true).apply()
                    aufnehmen()
                }
                else -> abbrechen("Die Spracherkennung des Handys antwortet nicht (Code $code). " +
                                  "Bitte „Angaben per Sprache“ noch einmal tippen.")
            }
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                abbrechen("Die App darf das Mikrofon nicht benutzen. Bitte in den Android-" +
                          "Einstellungen → Apps → Winterfeldt Lager → Berechtigungen das Mikrofon erlauben.")
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

    /** Nach einem Neustart der Erkennung: nur Signalton, dann aufnehmen. */
    private fun tonUndAufnehmen() = abspielen(listOf("signalton")) { aufnehmen() }

    private fun beenden() {
        if (!aktiv) return
        erkennerWeg()
        onHoeren(false)
        onFrage(null)
        // Abschluss ansagen, danach ist die Abfrage vorbei.
        abspielen(listOf(SprachAbfrage.ANSAGE_FERTIG)) { aktiv = false }
    }

    companion object {
        // Erst ab Android 12/13 als Konstanten vorhanden.
        private const val ERROR_ZU_VIELE_ANFRAGEN = 10
        private const val ERROR_VERBINDUNG_WEG = 11
        private const val ERROR_SPRACHE_FEHLT = 12
        private const val ERROR_SPRACHE_NICHT_VERFUEGBAR = 13
        private const val SYSTEMFENSTER = "systemfenster"

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
