package de.winterfeld.logistik.capture

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.winterfeld.logistik.WinterfeldApp
import de.winterfeld.logistik.data.local.CaptureEntity
import de.winterfeld.logistik.data.remote.dto.AnswerDto
import de.winterfeld.logistik.data.remote.dto.ConfirmResultDto
import de.winterfeld.logistik.data.remote.dto.ProductDto
import de.winterfeld.logistik.data.sync.SyncWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.io.File

/**
 * Zustandsmaschine des Erfassungs-Workflows:
 * Kamera → (erstes Foto startet Sprache + Verarbeitung) → weitere Fotos →
 * Kontrolle mit Rückfragen → Bestätigen → (Schnellmodus: sofort nächste Erfassung).
 */
class CaptureViewModel(app: Application) : AndroidViewModel(app) {

    private val container = (app as WinterfeldApp).container
    private val captures = container.captureRepository
    private val products = container.productRepository

    data class UiState(
        val capture: CaptureEntity? = null,
        val serverState: ProductDto? = null,
        val photoCount: Int = 0,
        val voiceActive: Boolean = false,
        /** Punkt, den die Sprachabfrage gerade abfragt (z. B. „Lagerplatz“). */
        val voicePrompt: String? = null,
        val liveTranscript: String = "",
        /** Schon beantwortete Punkte der Sprachabfrage: Titel → erkannter Wert. */
        val voiceAnswers: List<Pair<String, String>> = emptyList(),
        /** Mikrofon offen: „Jetzt sprechen“. */
        val voiceListening: Boolean = false,
        /** Grund, warum die Sprachabfrage nicht läuft — sichtbar statt still. */
        val voiceError: String? = null,
        val processingHint: String? = null,
        val duplicates: ConfirmResultDto? = null,
        val savedFlash: Boolean = false,      // "✓ Artikel gespeichert" (Schnellmodus)
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state

    fun startCapture(quickMode: Boolean) {
        viewModelScope.launch {
            val capture = captures.startCapture(quickMode)
            _state.value = UiState(capture = capture)
            SyncWorker.schedule(getApplication())
            pollServerState()
        }
    }

    fun onPhotoTaken(file: File, role: String) {
        val capture = _state.value.capture ?: return
        viewModelScope.launch {
            captures.addImage(capture.id, file, role)
            SyncWorker.schedule(getApplication())
            val isFirst = _state.value.photoCount == 0
            _state.value = _state.value.copy(
                photoCount = _state.value.photoCount + 1,
                // Erstes Foto → Mikrofon automatisch aktivieren (Anforderung 7)
                voiceActive = if (isFirst) true else _state.value.voiceActive,
                processingHint = if (isFirst) "KI-Erkennung läuft …" else null,
            )
        }
    }

    fun onLiveTranscript(text: String) {
        _state.value = _state.value.copy(liveTranscript = text)
    }

    /** Sprachabfrage ist bei [schritt]; null = beendet. */
    fun onVoicePrompt(schritt: SprachAbfrage.Schritt?) {
        _state.value = _state.value.copy(
            voicePrompt = schritt?.titel,
            voiceActive = schritt != null,
            liveTranscript = "",
            voiceError = if (schritt != null) null else _state.value.voiceError,
        )
    }

    fun onVoiceListening(offen: Boolean) {
        _state.value = _state.value.copy(voiceListening = offen)
    }

    fun onVoiceError(meldung: String) {
        _state.value = _state.value.copy(voiceError = meldung, voiceActive = false,
                                         voicePrompt = null, voiceListening = false)
    }

    fun onVoiceResult(schritt: SprachAbfrage.Schritt, ergebnis: SprachAbfrage.Ergebnis) {
        val capture = _state.value.capture ?: return
        when (ergebnis) {
            is SprachAbfrage.Ergebnis.Antwort -> {
                answer(ergebnis.antwort)
                merken(schritt.titel, ergebnis.anzeige)
            }
            is SprachAbfrage.Ergebnis.Freitext -> {
                merken(schritt.titel, ergebnis.text)
                // Freie Angaben wertet der Server wie bisher per KI aus.
                viewModelScope.launch {
                    captures.addTranscript(capture.id, ergebnis.text)
                    SyncWorker.schedule(getApplication())
                }
            }
            else -> Unit
        }
    }

    private fun merken(titel: String, wert: String) {
        val bisher = _state.value.voiceAnswers.filterNot { it.first == titel }
        _state.value = _state.value.copy(voiceAnswers = bisher + (titel to wert))
    }

    fun restartVoice() {
        _state.value = _state.value.copy(voiceActive = true, liveTranscript = "",
                                         voiceAnswers = emptyList(), voiceError = null)
    }

    fun stopVoice() {
        _state.value = _state.value.copy(voiceActive = false, voicePrompt = null,
                                         voiceListening = false)
    }

    /** Serverzustand (erkannte Felder, Rückfragen, Status) regelmäßig nachladen. */
    private fun pollServerState() {
        viewModelScope.launch {
            while (true) {
                delay(2500)
                val capture = _state.value.capture ?: return@launch
                val local = captures.capture(capture.id) ?: return@launch
                val serverId = local.serverProductId ?: continue
                try {
                    val server = products.getCaptureState(serverId)
                    _state.value = _state.value.copy(
                        capture = local,
                        serverState = server,
                        processingHint = processingLabel(server.processingStatus),
                    )
                    if (server.processingStatus in listOf("review_required", "shop_ready")) {
                        // Verarbeitung abgeschlossen — weiter pollen, aber seltener.
                        delay(5000)
                    }
                } catch (_: Exception) {
                    // offline → lokaler Zustand bleibt maßgeblich
                }
            }
        }
    }

    /** Vertriebskanäle zur Auswahl im Prüfbildschirm. */
    suspend fun kanaele() = products.kanaele(_state.value.serverState?.id)

    /** Festen Preis für einen Kanal setzen ("" = wieder Verkaufspreis + Aufschlag). */
    suspend fun kanalPreisSetzen(ids: List<String>, kanalId: String, preis: String) {
        val id = _state.value.serverState?.id ?: error("Artikel ist noch nicht beim Server")
        products.kanaeleSetzen(id, ids, mapOf(kanalId to preis))
    }

    /** Gewählte Kanäle des erfassten Artikels speichern. */
    suspend fun kanaeleSetzen(ids: List<String>): List<String> {
        val id = _state.value.serverState?.id ?: error("Artikel ist noch nicht beim Server")
        return products.kanaeleSetzen(id, ids)
    }

    fun answer(answer: AnswerDto) {
        val capture = _state.value.capture ?: return
        viewModelScope.launch {
            val serverId = captures.capture(capture.id)?.serverProductId
            try {
                if (serverId != null) {
                    val server = products.sendAnswersDirect(serverId, listOf(answer))
                    _state.value = _state.value.copy(serverState = server)
                    return@launch
                }
            } catch (_: Exception) { /* offline → Queue */ }
            captures.sendAnswer(capture.id, answer)
            SyncWorker.schedule(getApplication())
        }
    }

    fun confirm(duplicateAction: String? = null, duplicateId: String? = null,
                onDone: (quickMode: Boolean) -> Unit) {
        val current = _state.value
        val capture = current.capture ?: return
        viewModelScope.launch {
            val serverId = captures.capture(capture.id)?.serverProductId
            try {
                if (serverId != null) {
                    val result = products.let {
                        container.apiClient.service().confirm(serverId, duplicateAction, duplicateId)
                    }
                    if (result.status == "duplicate_found") {
                        _state.value = current.copy(duplicates = result)
                        return@launch
                    }
                }
            } catch (_: Exception) {
                // offline → Bestätigung in die Queue; Dubletten meldet der Server später.
                captures.confirm(capture.id, duplicateAction, duplicateId)
                SyncWorker.schedule(getApplication())
            }
            _state.value = current.copy(savedFlash = true, duplicates = null)
            delay(1500) // "✓ Artikel gespeichert"
            onDone(capture.quickMode)
        }
    }

    private fun processingLabel(status: String): String? = when (status) {
        "photo_uploaded" -> "Foto hochgeladen"
        "recognition_running" -> "KI-Erkennung läuft …"
        "product_identified" -> "Produkt identifiziert"
        "price_research_running" -> "Preisrecherche läuft …"
        "images_optimizing" -> "Bilder werden optimiert …"
        "shoptext_generating" -> "Shoptext wird erstellt …"
        "review_required" -> "Prüfung erforderlich"
        "shop_ready" -> "Shopbereit"
        "error" -> "Fehler — wird erneut versucht"
        else -> null
    }
}
