package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.local.PendingOperationEntity
import de.winterfeld.logistik.data.remote.dto.LocationDto
import de.winterfeld.logistik.data.remote.dto.SupplierDto
import de.winterfeld.logistik.data.repo.AuthRepository
import de.winterfeld.logistik.data.repo.CaptureRepository
import de.winterfeld.logistik.data.repo.ProductRepository
import de.winterfeld.logistik.data.sync.SyncWorker
import de.winterfeld.logistik.ui.components.SyncBadge

@Composable
fun SuppliersScreen(products: ProductRepository) {
    var suppliers by remember { mutableStateOf<List<SupplierDto>>(emptyList()) }
    LaunchedEffect(Unit) { try { suppliers = products.suppliers() } catch (_: Exception) {} }
    LazyColumn(Modifier.fillMaxSize().padding(20.dp),
               verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Lieferanten", style = MaterialTheme.typography.headlineMedium) }
        items(suppliers, key = { it.id }) { supplier ->
            Card(Modifier.fillMaxWidth()) {
                Text(supplier.name, Modifier.padding(14.dp),
                     style = MaterialTheme.typography.titleLarge)
            }
        }
    }
}

@Composable
fun LocationsScreen(products: ProductRepository) {
    var locations by remember { mutableStateOf<List<LocationDto>>(emptyList()) }
    LaunchedEffect(Unit) {
        try { locations = products.storageLocations() } catch (_: Exception) {}
    }
    LazyColumn(Modifier.fillMaxSize().padding(20.dp),
               verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Text("Lagerplätze", style = MaterialTheme.typography.headlineMedium) }
        items(locations, key = { it.id }) { location ->
            Card(Modifier.fillMaxWidth()) {
                Text("${location.code}  (${location.name})", Modifier.padding(14.dp),
                     style = MaterialTheme.typography.titleLarge)
            }
        }
    }
}

/** Sync-Status: Warteschlange, Fehler, manueller Retry (Anforderung 21). */
@Composable
fun SyncScreen(captures: CaptureRepository, onRetry: () -> Unit) {
    val pending by captures.observePendingOperations()
        .collectAsState(initial = emptyList<PendingOperationEntity>())
    val pendingCaptures by captures.observePendingCount().collectAsState(initial = 0)

    Column(Modifier.fillMaxSize().padding(20.dp),
           verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Synchronisierung", style = MaterialTheme.typography.headlineMedium)
        SyncBadge(pendingCaptures)
        Button(onClick = onRetry) { Text("Jetzt synchronisieren") }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(pending, key = { it.seq }) { operation ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${operation.type} · Erfassung ${operation.captureId.take(8)}…",
                             style = MaterialTheme.typography.titleLarge)
                        if (operation.attempts > 0) {
                            Text("Versuche: ${operation.attempts} — " +
                                 (operation.lastError ?: ""),
                                 color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
        if (pending.isEmpty()) {
            Text("Alle Erfassungen sind hochgeladen.",
                 color = MaterialTheme.colorScheme.secondary)
        }
    }
}

@Composable
fun SettingsScreen(auth: AuthRepository, serverUrl: String, onLogout: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(20.dp),
           verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("Einstellungen", style = MaterialTheme.typography.headlineMedium)
        Card { Column(Modifier.padding(16.dp)) {
            Text("Server", style = MaterialTheme.typography.titleLarge)
            Text(serverUrl.ifEmpty { "nicht konfiguriert" })
            Text("Die Server-URL wird beim Anmelden gesetzt. Es sind keine API-Keys " +
                 "auf diesem Gerät gespeichert — sämtliche KI- und Recherchedienste " +
                 "laufen über das Backend.",
                 color = MaterialTheme.colorScheme.outline)
        } }
        Card { Column(Modifier.padding(16.dp)) {
            Text("Datenschutz", style = MaterialTheme.typography.titleLarge)
            Text("Das Mikrofon ist nur während der Erfassung aktiv und wird immer " +
                 "deutlich angezeigt („● Spracheingabe läuft …“). Sprachaufnahmen " +
                 "werden serverseitig nach der Transkription gemäß Konfiguration gelöscht.",
                 color = MaterialTheme.colorScheme.outline)
        } }
        OutlinedButton(onClick = { auth.logout(); onLogout() }) { Text("Abmelden") }
    }
}
