package de.winterfeld.logistik.capture

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * On-Device-/System-Spracherkennung (deutsch, freies Sprechen).
 * Liefert Zwischenstände (Live-Anzeige) und das Endtranskript; das Endtranskript
 * wird an das Backend geschickt und dort per LLM strukturiert ausgewertet.
 */
class VoiceRecognizer(
    private val context: Context,
    private val onPartial: (String) -> Unit,
    private val onFinal: (String) -> Unit,
    private val onError: (String) -> Unit,
) {
    private var recognizer: SpeechRecognizer? = null
    private val collected = StringBuilder()

    fun start() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onError("Spracherkennung auf diesem Gerät nicht verfügbar")
            return
        }
        collected.clear()
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle) {
                    val text = results
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    if (text.isNotBlank()) {
                        if (collected.isNotEmpty()) collected.append(" ")
                        collected.append(text)
                    }
                    // Weiter zuhören, bis der Benutzer explizit stoppt.
                    startListening(intent())
                }

                override fun onPartialResults(partialResults: Bundle) {
                    val partial = partialResults
                        .getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    onPartial((collected.toString() + " " + partial).trim())
                }

                override fun onError(error: Int) {
                    when (error) {
                        SpeechRecognizer.ERROR_NO_MATCH,
                        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> startListening(intent())
                        else -> onError("Spracherkennung fehlgeschlagen (Code $error)")
                    }
                }

                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })
            startListening(intent())
        }
    }

    fun stop() {
        recognizer?.stopListening()
        recognizer?.destroy()
        recognizer = null
        onFinal(collected.toString().trim())
    }

    private fun intent(): Intent =
        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                     RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "de-DE")
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        }
}
