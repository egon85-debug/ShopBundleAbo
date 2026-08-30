package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.remote.dto.DashboardDto
import de.winterfeld.logistik.data.repo.ProductRepository
import de.winterfeld.logistik.ui.components.BigButton
import de.winterfeld.logistik.ui.components.StatCard
import de.winterfeld.logistik.ui.components.SyncBadge

@Composable
fun DashboardScreen(
    products: ProductRepository,
    pendingCount: Int,
    quickMode: Boolean,
    onQuickModeChange: (Boolean) -> Unit,
    onStartCapture: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    var dashboard by remember { mutableStateOf<DashboardDto?>(null) }
    LaunchedEffect(Unit) {
        try { dashboard = products.dashboard() } catch (_: Exception) { /* offline */ }
    }

    Column(Modifier.fillMaxSize().padding(24.dp),
           verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically) {
            Text("WINTERFELD LOGISTIK", style = MaterialTheme.typography.headlineMedium)
            SyncBadge(pendingCount)
        }

        BigButton("＋ ARTIKEL ERFASSEN") { onStartCapture() }

        Row(verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Switch(checked = quickMode, onCheckedChange = onQuickModeChange)
            Text("Schnellerfassungsmodus (Foto → Sprache → Speichern → nächster Artikel)")
        }

        dashboard?.let { d ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                StatCard("Artikel heute", d.productsToday.toString(), Modifier.weight(1f))
                StatCard("Artikel gesamt", d.productsTotal.toString(), Modifier.weight(1f))
                StatCard("Noch zu prüfen", d.reviewRequired.toString(), Modifier.weight(1f))
                StatCard("Shopbereit", d.shopReady.toString(), Modifier.weight(1f))
                StatCard("Veröffentlicht", d.published.toString(), Modifier.weight(1f))
            }
        } ?: Text("Kennzahlen werden geladen … (offline: lokale Erfassung funktioniert weiter)",
                  color = MaterialTheme.colorScheme.outline)

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            listOf("Artikel" to "products", "Bestand" to "products",
                   "Lagerplätze" to "locations", "Lieferanten" to "suppliers",
                   "Shop" to "shopready", "Synchronisierung" to "sync",
                   "Einstellungen" to "settings").forEach { (label, route) ->
                OutlinedButton(onClick = { onNavigate(route) },
                               modifier = Modifier.weight(1f)) { Text(label) }
            }
        }
    }
}
