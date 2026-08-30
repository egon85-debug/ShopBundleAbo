package de.winterfeld.logistik.capture

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import de.winterfeld.logistik.data.remote.dto.AnswerDto

/**
 * Bindet Kamera-, Sprach- und Kontroll-Screen zu einem Workflow zusammen.
 * Schnellmodus: nach Speichern sofort zurück in die Kamera (Anforderung 19).
 */
@Composable
fun CaptureFlowScreen(quickMode: Boolean, onExit: () -> Unit) {
    val viewModel: CaptureViewModel = viewModel()
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var step by remember { mutableStateOf("camera") } // camera | review

    LaunchedEffect(Unit) {
        if (state.capture == null) viewModel.startCapture(quickMode)
    }

    // Spracherkennung an den Zustand koppeln; Mikrofon-Lebenszyklus sauber beenden.
    val recognizer = remember {
        VoiceRecognizer(
            context,
            onPartial = viewModel::onLiveTranscript,
            onFinal = viewModel::onVoiceFinished,
            onError = { viewModel.stopVoice() },
        )
    }
    var voiceRunning by remember { mutableStateOf(false) }
    LaunchedEffect(state.voiceActive) {
        if (state.voiceActive && !voiceRunning) { recognizer.start(); voiceRunning = true }
        if (!state.voiceActive && voiceRunning) { voiceRunning = false }
    }
    DisposableEffect(Unit) { onDispose { if (voiceRunning) recognizer.stop() } }

    when (step) {
        "camera" -> CameraScreen(
            photoCount = state.photoCount,
            voiceActive = state.voiceActive,
            liveTranscript = state.liveTranscript,
            processingHint = state.processingHint,
            onPhoto = viewModel::onPhotoTaken,
            onBarcode = { value ->
                viewModel.answer(AnswerDto(field = "ean", value = value))
            },
            onDone = {
                if (voiceRunning) { recognizer.stop(); voiceRunning = false }
                step = "review"
            },
        )
        "review" -> ReviewScreen(
            product = state.serverState,
            duplicates = state.duplicates,
            savedFlash = state.savedFlash,
            onAnswer = viewModel::answer,
            onEditField = { field, value ->
                viewModel.answer(AnswerDto(field = field, value = value))
            },
            onMorePhotos = { step = "camera" },
            onSpeakAgain = {
                viewModel.restartVoice()
                recognizer.start(); voiceRunning = true
                step = "camera"
            },
            onSave = {
                viewModel.confirm { wasQuickMode ->
                    if (wasQuickMode) {
                        // Sofort bereit für den nächsten Artikel.
                        step = "camera"
                        viewModel.startCapture(quickMode = true)
                    } else {
                        onExit()
                    }
                }
            },
            onDuplicateAction = { action, duplicateId ->
                viewModel.confirm(action, duplicateId) { wasQuickMode ->
                    if (wasQuickMode) {
                        step = "camera"
                        viewModel.startCapture(quickMode = true)
                    } else onExit()
                }
            },
        )
    }
}
