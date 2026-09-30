package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.remote.dto.DashboardDto
import de.winterfeld.logistik.data.repo.ProductRepository
import de.winterfeld.logistik.ui.components.BigButton
import de.winterfeld.logistik.ui.components.CountPill
import de.winterfeld.logistik.ui.components.ListCard
import de.winterfeld.logistik.ui.components.ListDivider
import de.winterfeld.logistik.ui.components.ListRow
import de.winterfeld.logistik.ui.components.SectionHeader
import de.winterfeld.logistik.ui.components.SyncIcons
import de.winterfeld.logistik.ui.components.syncText

@Composable
fun DashboardScreen(
    products: ProductRepository,
    pendingCount: Int,
    quickMode: Boolean,
    onQuickModeChange: (Boolean) -> Unit,
    onStartCapture: () -> Unit,
    onNavigate: (String) -> Unit,
    hinweis: String? = null,
    onHinweisOk: () -> Unit = {},
) {
    var dashboard by remember { mutableStateOf<DashboardDto?>(null) }
    var offline by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        try { dashboard = products.dashboard(); offline = false } catch (_: Exception) { offline = true }
    }
    DashboardContent(dashboard, offline, pendingCount, quickMode, onQuickModeChange,
                     onStartCapture, onNavigate, hinweis, onHinweisOk)
}

/** Startseite als Liste: eine Hauptaktion oben, darunter antippbare Zeilen. */
@Composable
fun DashboardContent(
    dashboard: DashboardDto?,
    offline: Boolean,
    pendingCount: Int,
    quickMode: Boolean,
    onQuickModeChange: (Boolean) -> Unit,
    onStartCapture: () -> Unit,
    onNavigate: (String) -> Unit,
    hinweis: String? = null,
    onHinweisOk: () -> Unit = {},
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())
               .padding(horizontal = 16.dp, vertical = 20.dp),
           verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Winterfeldt Logistik", style = MaterialTheme.typography.headlineMedium)

        if (hinweis != null) {
            ListCard {
                ListRow(hinweis, icon = Icons.Default.Warning,
                        iconTint = MaterialTheme.colorScheme.error, titleMaxLines = 4,
                        onClick = onHinweisOk, showChevron = false) {
                    TextButton(onClick = onHinweisOk) { Text("OK") }
                }
            }
        }

        BigButton("Artikel erfassen", icon = Icons.Default.Add) { onStartCapture() }

        ListCard {
            ListRow(
                title = "Schnellerfassung",
                subtitle = "Nach dem Speichern sofort der nächste Artikel",
                onClick = { onQuickModeChange(!quickMode) },
                showChevron = false,
            ) { Switch(checked = quickMode, onCheckedChange = onQuickModeChange) }
            ListDivider()
            ListRow(
                title = syncText(pendingCount),
                subtitle = if (pendingCount > 0) "Wird automatisch gesendet, sobald Netz da ist"
                           else "Alle Aufnahmen sind auf dem Server",
                icon = if (pendingCount > 0) SyncIcons.Cloud else SyncIcons.CloudDone,
                iconTint = if (pendingCount > 0) MaterialTheme.colorScheme.error
                           else MaterialTheme.colorScheme.secondary,
                onClick = { onNavigate("sync") },
            )
        }

        SectionHeader("Artikel")
        if (offline) {
            Text("Keine Verbindung zum Server — Zahlen fehlen. Erfassen geht trotzdem, " +
                 "die Aufnahmen werden später hochgeladen.",
                 color = MaterialTheme.colorScheme.outline,
                 style = MaterialTheme.typography.bodyMedium)
        }
        ListCard {
            ListRow("Alle Artikel", icon = Icons.AutoMirrored.Filled.List,
                    subtitle = dashboard?.let { "heute ${it.productsToday} neu erfasst" },
                    onClick = { onNavigate("products") }) { CountPill(dashboard?.productsTotal) }
            ListDivider()
            ListRow("Zu prüfen", icon = Icons.Default.Warning,
                    iconTint = MaterialTheme.colorScheme.error,
                    subtitle = "Angaben fehlen oder sind unsicher",
                    onClick = { onNavigate("products?filter=review_required") }) {
                CountPill(dashboard?.reviewRequired, highlight = true)
            }
            ListDivider()
            ListRow("Shopbereit", icon = Icons.Default.ShoppingCart,
                    onClick = { onNavigate("products?filter=shop_ready") }) {
                CountPill(dashboard?.shopReady)
            }
            ListDivider()
            ListRow("Veröffentlicht", icon = Icons.Default.CheckCircle,
                    iconTint = MaterialTheme.colorScheme.secondary,
                    onClick = { onNavigate("products?filter=published") }) {
                CountPill(dashboard?.published)
            }
        }

        SectionHeader("Verwaltung")
        ListCard {
            ListRow("Lagerplätze", icon = Icons.Default.Place,
                    onClick = { onNavigate("locations") })
            ListDivider()
            ListRow("Lieferanten", icon = Icons.Default.Person,
                    onClick = { onNavigate("suppliers") })
            ListDivider()
            ListRow("Synchronisierung", icon = Icons.Default.Refresh,
                    onClick = { onNavigate("sync") })
            ListDivider()
            ListRow("Einstellungen", icon = Icons.Default.Settings,
                    onClick = { onNavigate("settings") })
        }
    }
}
