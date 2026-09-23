package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
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
import de.winterfeld.logistik.BuildConfig
import de.winterfeld.logistik.data.local.PendingOperationEntity
import de.winterfeld.logistik.data.remote.dto.LocationDto
import de.winterfeld.logistik.data.remote.dto.SupplierDto
import de.winterfeld.logistik.data.repo.AuthRepository
import de.winterfeld.logistik.data.repo.CaptureRepository
import de.winterfeld.logistik.data.repo.ProductRepository
import de.winterfeld.logistik.ui.components.AppTopBar
import de.winterfeld.logistik.ui.components.BigButton
import de.winterfeld.logistik.ui.components.ListCard
import de.winterfeld.logistik.ui.components.ListDivider
import de.winterfeld.logistik.ui.components.ListRow
import de.winterfeld.logistik.ui.components.SectionHeader
import de.winterfeld.logistik.ui.components.SyncIcons
import de.winterfeld.logistik.ui.components.syncText

/** Einfache Liste unter einer Kopfzeile; zeigt Laden, Fehler und "leer". */
@Composable
private fun <T> MasterDataList(
    title: String, onBack: () -> Unit, load: suspend () -> List<T>, emptyText: String,
    row: @Composable (T) -> Unit,
) {
    var items by remember { mutableStateOf<List<T>?>(null) }
    var error by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        try { items = load() } catch (_: Exception) { error = true }
    }
    Column(Modifier.fillMaxSize()) {
        AppTopBar(title, onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
            val list = items
            when {
                error -> item { Text("Keine Verbindung zum Server.",
                                     color = MaterialTheme.colorScheme.error) }
                list == null -> item { Text("Lade …", color = MaterialTheme.colorScheme.outline) }
                list.isEmpty() -> item { Text(emptyText, color = MaterialTheme.colorScheme.outline) }
                else -> item {
                    ListCard {
                        list.forEachIndexed { i, entry ->
                            if (i > 0) ListDivider()
                            row(entry)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun SuppliersScreen(products: ProductRepository, onBack: () -> Unit) {
    MasterDataList<SupplierDto>("Lieferanten", onBack, { products.suppliers() },
        emptyText = "Noch keine Lieferanten. Sie entstehen automatisch, sobald bei einer " +
                    "Aufnahme ein Lieferant genannt wird.") { supplier ->
        ListRow(supplier.name, icon = Icons.Default.Person)
    }
}

@Composable
fun LocationsScreen(products: ProductRepository, onBack: () -> Unit) {
    MasterDataList<LocationDto>("Lagerplätze", onBack, { products.storageLocations() },
        emptyText = "Noch keine Lagerplätze. Sie werden im Admin-Bereich angelegt.") { location ->
        ListRow(location.code, subtitle = location.name, icon = Icons.Default.Place)
    }
}

/** Sync-Status: Warteschlange, Fehler, manueller Retry (Anforderung 21). */
@Composable
fun SyncScreen(captures: CaptureRepository, onBack: () -> Unit, onRetry: () -> Unit) {
    val pending by captures.observePendingOperations()
        .collectAsState(initial = emptyList<PendingOperationEntity>())
    val pendingCaptures by captures.observePendingCount().collectAsState(initial = 0)
    SyncContent(pending, pendingCaptures, onBack, onRetry)
}

@Composable
fun SyncContent(pending: List<PendingOperationEntity>, pendingCaptures: Int,
                onBack: () -> Unit, onRetry: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        AppTopBar("Synchronisierung", onBack = onBack)
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                   verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                ListCard {
                    ListRow(syncText(pendingCaptures),
                            subtitle = if (pendingCaptures > 0)
                                "Wird automatisch gesendet, sobald Netz da ist"
                                else "Alle Aufnahmen sind auf dem Server",
                            icon = if (pendingCaptures > 0) SyncIcons.Cloud else SyncIcons.CloudDone,
                            iconTint = if (pendingCaptures > 0) MaterialTheme.colorScheme.error
                                       else MaterialTheme.colorScheme.secondary)
                }
            }
            item { BigButton("Jetzt senden", onClick = onRetry) }
            if (pending.isNotEmpty()) {
                item { SectionHeader("Warteschlange") }
                item {
                    ListCard {
                        pending.forEachIndexed { i, operation ->
                            if (i > 0) ListDivider()
                            ListRow(
                                title = OPERATION_LABELS[operation.type] ?: operation.type,
                                subtitle = "Aufnahme ${operation.captureId.take(8)}" +
                                    if (operation.attempts > 0)
                                        " · ${operation.attempts} Versuche · ${operation.lastError ?: ""}"
                                    else "",
                            )
                        }
                    }
                }
            }
        }
    }
}

private val OPERATION_LABELS = mapOf(
    "CREATE_CAPTURE" to "Aufnahme anlegen", "UPLOAD_IMAGE" to "Foto hochladen",
    "SEND_VOICE" to "Sprachnotiz senden", "SEND_ANSWER" to "Antwort senden",
    "CONFIRM" to "Speichern bestätigen",
)

@Composable
fun SettingsScreen(auth: AuthRepository, serverUrl: String, onBack: () -> Unit,
                   onLogout: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        AppTopBar("Einstellungen", onBack = onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())
                   .padding(start = 16.dp, end = 16.dp, bottom = 24.dp),
               verticalArrangement = Arrangement.spacedBy(12.dp)) {
            ListCard {
                ListRow("Server", subtitle = serverUrl.ifEmpty { "nicht eingestellt" })
                ListDivider()
                ListRow("App-Version", subtitle = BuildConfig.VERSION_NAME)
            }
            SectionHeader("Datenschutz")
            ListCard {
                ListRow("Keine Schlüssel auf dem Gerät",
                        subtitle = "KI- und Recherchedienste laufen ausschließlich über den " +
                                   "Server. Auf dem Handy liegen keine API-Schlüssel.")
                ListDivider()
                ListRow("Mikrofon nur bei der Aufnahme",
                        subtitle = "Während der Spracheingabe steht oben „● Spracheingabe " +
                                   "läuft …“. Aufnahmen werden nach der Umschrift auf dem " +
                                   "Server gelöscht, wie dort eingestellt.")
            }
            OutlinedButton(onClick = { auth.logout(); onLogout() }) { Text("Abmelden") }
        }
    }
}
