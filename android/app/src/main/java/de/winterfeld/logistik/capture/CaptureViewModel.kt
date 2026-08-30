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
        val liveTranscript: String = "",
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

    fun onVoiceFinished(finalTranscript: String) {
        val capture = _state.value.capture ?: return
        _state.value = _state.value.copy(voiceActive = false)
        if (finalTranscript.isBlank()) return
        viewModelScope.launch {
            captures.addTranscript(capture.id, finalTranscript)
            SyncWorker.schedule(getApplication())
        }
    }

    fun restartVoice() {
        _state.value = _state.value.copy(voiceActive = true, liveTranscript = "")
    }

    fun stopVoice() {
        _state.value = _state.value.copy(voiceActive = false)
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
