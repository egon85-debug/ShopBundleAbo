package de.winterfeld.logistik.capture

import android.content.Context
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import java.io.File
import java.util.UUID

private val ROLES = listOf(
    "front" to "Vorderseite", "back" to "Rückseite", "packaging" to "Verpackung",
    "barcode" to "EAN/Barcode", "type_plate" to "Typenschild",
    "serial_number" to "Seriennr.", "accessories" to "Zubehör", "damage" to "Beschädigung",
)

/** Empfohlene Reihenfolge — die App zeigt an, welche Ansicht als Nächstes fehlt. */
private val SUGGESTED_ORDER = listOf("front", "back", "packaging", "barcode", "type_plate")

@Composable
fun CameraScreen(
    photoCount: Int,
    voiceActive: Boolean,
    voicePrompt: String?,
    liveTranscript: String,
    voiceAnswers: List<Pair<String, String>>,
    voiceListening: Boolean,
    voiceError: String?,
    onVoiceStart: () -> Unit,
    onVoiceSkip: () -> Unit,
    onVoiceStop: () -> Unit,
    processingHint: String?,
    onPhoto: (File, String) -> Unit,
    onBarcode: (String) -> Unit,
    onDone: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var selectedRole by remember { mutableStateOf(SUGGESTED_ORDER.first()) }
    val imageCapture = remember { ImageCapture.Builder().build() }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val providerFuture = ProcessCameraProvider.getInstance(ctx)
                providerFuture.addListener({
                    val provider = providerFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build().also {
                            it.setAnalyzer(ContextCompat.getMainExecutor(ctx),
                                           BarcodeAnalyzer(onBarcode))
                        }
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture, analysis)
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            },
        )

        // Statuszeile oben: Verarbeitung + Mikrofon-Transparenz (Anforderung 24)
        Column(Modifier.align(Alignment.TopCenter).fillMaxWidth()
                   .background(Color(0xAA000000)).padding(12.dp)) {
            if (voiceActive) {
                // Sprachabfrage: welche Angabe gerade dran ist und ob das Mikrofon offen ist.
                Text(if (voiceListening) "🎤 ${voicePrompt ?: ""} – jetzt sprechen"
                     else "🔊 ${voicePrompt ?: "Sprachabfrage"} …",
                     color = if (voiceListening) Color(0xFFFF5252) else Color.White,
                     style = MaterialTheme.typography.titleLarge)
                if (liveTranscript.isNotBlank()) {
                    Text(liveTranscript, color = Color.White, maxLines = 2)
                }
                Text("„weiter“ überspringt · „zurück“ · „fertig“ beendet",
                     color = Color(0xFFBDBDBD), style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onVoiceSkip) { Text("Überspringen", color = Color.White) }
                    OutlinedButton(onClick = onVoiceStop) { Text("Stopp", color = Color.White) }
                }
            } else if (photoCount > 0) {
                voiceError?.let { Text("⚠ $it", color = Color(0xFFFF8A80)) }
                Button(onClick = onVoiceStart) {
                    Text(if (voiceAnswers.isEmpty()) "🎤 Angaben per Sprache" else "🎤 Sprachabfrage neu starten")
                }
            }
            voiceAnswers.forEach { (titel, wert) ->
                Text("✓ $titel: $wert", color = Color(0xFFA5D6A7), maxLines = 1)
            }
            processingHint?.let { Text(it, color = Color(0xFF9CC3FF)) }
            val nextMissing = SUGGESTED_ORDER.getOrNull(photoCount)
            if (nextMissing != null && photoCount > 0) {
                val label = ROLES.first { it.first == nextMissing }.second
                Text("Empfohlen als Nächstes: $label", color = Color(0xFFFFE082))
            }
        }

        // Rollen-Chips + Auslöser unten
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()
                   .background(Color(0xAA000000)).padding(12.dp),
               horizontalAlignment = Alignment.CenterHorizontally) {
            // Alle Ansichten in einer wischbaren Zeile — auf dem Handy passt
            // keine feste Reihe von Chips nebeneinander.
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                ROLES.forEach { (value, label) ->
                    FilterChip(selected = selectedRole == value,
                               onClick = { selectedRole = value },
                               label = { Text(label) },
                               colors = FilterChipDefaults.filterChipColors(
                                   labelColor = Color.White,
                                   selectedContainerColor = MaterialTheme.colorScheme.primary,
                                   selectedLabelColor = Color.White))
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                Text("$photoCount Fotos", color = Color.White)
                // Großer runder Auslöser
                Button(
                    onClick = { takePhoto(context, imageCapture, selectedRole, onPhoto)
                                // Nach dem Foto zur nächsten empfohlenen Rolle springen.
                                SUGGESTED_ORDER.getOrNull(photoCount + 1)
                                    ?.let { selectedRole = it } },
                    shape = CircleShape,
                    modifier = Modifier.size(92.dp),
                ) { Text("📷", style = MaterialTheme.typography.headlineMedium) }
                Button(onClick = onDone, enabled = photoCount > 0) { Text("Fertig →") }
            }
        }
    }
}

private fun takePhoto(context: Context, imageCapture: ImageCapture, role: String,
                      onPhoto: (File, String) -> Unit) {
    val dir = File(context.filesDir, "captures").apply { mkdirs() }
    val file = File(dir, "${UUID.randomUUID()}.jpg")
    imageCapture.takePicture(
        ImageCapture.OutputFileOptions.Builder(file).build(),
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(output: ImageCapture.OutputFileResults) =
                onPhoto(file, role)
            override fun onError(exception: ImageCaptureException) {
                file.delete()
            }
        },
    )
}
