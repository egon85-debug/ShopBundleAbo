package de.winterfeld.logistik.capture

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import de.winterfeld.logistik.capture.SprachAbfrage.Ergebnis
import java.util.Locale

/**
 * Führt die Sprachabfrage durch: Frage ansagen → kurzer Ton → genau eine
 * Antwort aufnehmen → nächste Frage. Die Aufnahme beginnt erst nach dem Ton,
 * damit die Ansage nicht mit erkannt wird.
 *
 * Sprachbefehle bei jeder Frage: „weiter“ (überspringen), „zurück“, „fertig“.
 * Wird zweimal nichts verstanden, geht es mit der nächsten Frage weiter.
 */
class SprachDialog(
    private val context: Context,
    /** Aktuelle Frage (null = Abfrage beendet). */
    private val onFrage: (SprachAbfrage.Schritt?) -> Unit,
    /** Zwischenstand der Erkennung zur Anzeige. */
    private val onZwischenstand: (String) -> Unit,
    private val onErgebnis: (SprachAbfrage.Schritt, Ergebnis) -> Unit,
    private val onFehler: (String) -> Unit,
) {
    private val haupt = Handler(Looper.getMainLooper())
    private var tts: TextToSpeech? = null
    private var ttsBereit = false
    private var ton: ToneGenerator? = null
    private var erkenner: SpeechRecognizer? = null
    private var schritte: List<SprachAbfrage.Schritt> = SprachAbfrage.SCHRITTE
    private var index = 0
    private var versuche = 0
    private var aktiv = false

    /** Beginnt die Abfrage von vorn. */
    fun start(schritte: List<SprachAbfrage.Schritt> = SprachAbfrage.SCHRITTE) {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onFehler("Spracherkennung auf diesem Gerät nicht verfügbar")
            return
        }
        stoppen(melden = false)
        this.schritte = schritte
        index = 0
        versuche = 0
        aktiv = true
        ton = runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 80) }.getOrNull()
        if (tts == null) {
            // Der Rückruf kommt auf dem Hauptthread, sobald die Sprachausgabe bereit ist.
            tts = TextToSpeech(context) { status ->
                ttsBereit = status == TextToSpeech.SUCCESS &&
                    (tts?.setLanguage(Locale.GERMANY) ?: TextToSpeech.LANG_NOT_SUPPORTED) >= 0
                tts?.setOnUtteranceProgressListener(ansageListener)
                if (aktiv) fragen()
            }
        } else {
            fragen()
        }
    }

    /** Bricht die Abfrage ab (z. B. beim Verlassen der Kamera). */
    fun stop() = stoppen(melden = true)

    fun freigeben() {
        stoppen(melden = false)
        tts?.shutdown()
        tts = null
    }

    private fun stoppen(melden: Boolean) {
        val warAktiv = aktiv
        aktiv = false
        haupt.removeCallbacksAndMessages(null)
        tts?.stop()
        erkenner?.destroy()
        erkenner = null
        ton?.release()
        ton = null
        if (melden && warAktiv) onFrage(null)
    }

    private fun fragen(hinweis: String? = null) {
        if (!aktiv) return
        val schritt = schritte.getOrNull(index) ?: return beenden()
        onFrage(schritt)
        onZwischenstand("")
        val ansage = listOfNotNull(hinweis, schritt.ansage).joinToString(". ")
        if (ttsBereit) {
            tts?.speak(ansage, TextToSpeech.QUEUE_FLUSH, null, "frage-$index")
        } else {
            // Ohne Sprachausgabe: Frage steht auf dem Bildschirm, der Ton genügt.
            haupt.postDelayed({ tonUndAufnehmen() }, 300)
        }
    }

    private val ansageListener = object : UtteranceProgressListener() {
        override fun onStart(utteranceId: String?) {}
        override fun onDone(utteranceId: String?) { haupt.post { tonUndAufnehmen() } }
        @Deprecated("Deprecated in Java")
        override fun onError(utteranceId: String?) { haupt.post { tonUndAufnehmen() } }
    }

    private fun tonUndAufnehmen() {
        if (!aktiv) return
        ton?.startTone(ToneGenerator.TONE_PROP_BEEP, 150)
        // Aufnahme erst nach dem Ton, sonst hört das Mikrofon ihn mit.
        haupt.postDelayed({ aufnehmen() }, 250)
    }

    private fun aufnehmen() {
        if (!aktiv) return
        erkenner?.destroy()
        erkenner = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle) {
                    val text = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    haupt.post { verarbeiten(text) }
                }

                override fun onPartialResults(partialResults: Bundle) {
                    partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull()?.let(onZwischenstand)
                }

                override fun onError(error: Int) {
                    haupt.post {
                        when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH,
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> nichtVerstanden("Nicht verstanden")
                            else -> {
                                stoppen(melden = true)
                                onFehler("Spracherkennung fehlgeschlagen (Code $error)")
                            }
                        }
                    }
                }

                override fun onReadyForSpeech(params: Bundle?) {}
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
                },
            )
        }
    }

    private fun verarbeiten(text: String) {
        if (!aktiv) return
        val schritt = schritte.getOrNull(index) ?: return beenden()
        if (text.isBlank()) return nichtVerstanden("Nicht verstanden")
        when (val ergebnis = SprachAbfrage.lesen(schritt, text)) {
            is Ergebnis.Unklar -> nichtVerstanden(ergebnis.hinweis)
            Ergebnis.Fertig -> beenden()
            Ergebnis.Zurueck -> { index = (index - 1).coerceAtLeast(0); versuche = 0; fragen() }
            Ergebnis.Weiter -> naechste()
            else -> { onErgebnis(schritt, ergebnis); naechste() }
        }
    }

    private fun nichtVerstanden(hinweis: String) {
        if (versuche++ >= 1) naechste() else fragen(hinweis)
    }

    private fun naechste() {
        index++
        versuche = 0
        if (index < schritte.size) fragen() else beenden()
    }

    private fun beenden() {
        stoppen(melden = true)
    }
}
