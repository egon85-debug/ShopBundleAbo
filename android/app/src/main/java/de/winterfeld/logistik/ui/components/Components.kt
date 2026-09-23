package de.winterfeld.logistik.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

/** Großer Touch-Button (min. 64 dp Höhe) für Lagerbedienung. */
@Composable
fun BigButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true,
              onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled,
           modifier = modifier.fillMaxWidth().height(72.dp)) {
        Text(text, style = MaterialTheme.typography.titleLarge)
    }
}

@Composable
fun StatCard(label: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.displayLarge,
                 color = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

/** Permanente Sync-Anzeige: "✓ Synchronisiert" / "☁ N Artikel warten auf Upload". */
@Composable
fun SyncBadge(pendingCount: Int, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (pendingCount == 0) {
            Icon(SyncIcons.CloudDone, contentDescription = null,
                 tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(22.dp))
            Text("Synchronisiert", color = MaterialTheme.colorScheme.secondary)
        } else {
            Icon(SyncIcons.Cloud, contentDescription = null,
                 tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(22.dp))
            Text("$pendingCount Artikel warten auf Upload",
                 color = MaterialTheme.colorScheme.error)
        }
    }
}

/** Markiert unsichere KI-Felder (Confidence unter Schwellwert). */
@Composable
fun ConfidenceChip(confidence: Double?, source: String?) {
    when {
        source == "user" -> Text("✓ bestätigt", color = MaterialTheme.colorScheme.secondary,
                                 style = MaterialTheme.typography.bodyMedium)
        confidence != null && confidence < 0.85 ->
            Text("⚠ unsicher (${(confidence * 100).toInt()} %)",
                 color = MaterialTheme.colorScheme.error,
                 style = MaterialTheme.typography.bodyMedium)
        else -> {}
    }
}
