package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.remote.dto.ProductDto
import de.winterfeld.logistik.data.repo.ProductRepository

private val STATUS_FILTERS = listOf(
    null to "Alle", "review_required" to "Zu prüfen",
    "shop_ready" to "Shopbereit", "published" to "Veröffentlicht",
)

@Composable
fun ProductListScreen(products: ProductRepository, initialStatus: String? = null,
                      onOpen: (String) -> Unit) {
    var query by remember { mutableStateOf("") }
    var status by remember { mutableStateOf(initialStatus) }
    var items by remember { mutableStateOf<List<ProductDto>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(query, status) {
        try {
            items = products.list(query.ifBlank { null }, status).items
            error = null
        } catch (e: Exception) {
            error = "Artikelliste momentan nicht verfügbar (offline?)"
        }
    }

    Column(Modifier.fillMaxSize().padding(20.dp),
           verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Artikel", style = MaterialTheme.typography.headlineMedium)
        OutlinedTextField(value = query, onValueChange = { query = it },
            label = { Text("Suche (Name, SKU, EAN, Hersteller)") },
            modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            STATUS_FILTERS.forEach { (value, label) ->
                FilterChip(selected = status == value, onClick = { status = value },
                           label = { Text(label) })
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { product ->
                Card(Modifier.fillMaxWidth().clickable { onOpen(product.id) }) {
                    Row(Modifier.fillMaxWidth().padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(product.productName ?: product.internalSku,
                                 style = MaterialTheme.typography.titleLarge)
                            Text("${product.internalSku} · EAN ${product.ean ?: "–"} · " +
                                 "${product.storageLocationCode ?: "kein Lagerplatz"}",
                                 color = MaterialTheme.colorScheme.outline)
                        }
                        Column {
                            Text("Bestand: ${product.stockQuantity}")
                            Text(product.salePrice?.plus(" €") ?: "–",
                                 color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ProductDetailScreen(products: ProductRepository, productId: String) {
    var product by remember { mutableStateOf<ProductDto?>(null) }
    LaunchedEffect(productId) {
        try { product = products.get(productId) } catch (_: Exception) {}
    }
    val p = product ?: run {
        Text("Lade …", modifier = Modifier.padding(20.dp)); return
    }
    LazyColumn(Modifier.fillMaxSize().padding(20.dp),
               verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text(p.productName ?: p.internalSku,
                    style = MaterialTheme.typography.headlineMedium) }
        item { Text("${p.internalSku} · Status: ${p.processingStatus} / ${p.publicationStatus}") }
        item {
            Card { Column(Modifier.padding(16.dp), Arrangement.spacedBy(6.dp)) {
                Text("Hersteller: ${p.manufacturer ?: "–"} (${p.brand ?: "–"})")
                Text("Modell: ${p.model ?: "–"} · MPN: ${p.mpn ?: "–"}")
                Text("EAN: ${p.ean ?: "–"} · Kategorie: ${p.category ?: "–"}")
                Text("Zustand: ${p.condition} ${p.packagingCondition ?: ""}")
                Text("Bestand: ${p.stockQuantity} (verfügbar ${p.availableQuantity})")
                Text("EK netto: ${p.purchasePriceNet ?: "–"} € · VK: ${p.salePrice ?: "–"} €")
                Text("Marktpreis: ${p.lowestMarketPrice ?: "–"}–${p.highestMarketPrice ?: "–"} €")
                Text("Lieferant: ${p.supplierName ?: "–"}")
                Text("Lagerplatz: ${p.storageLocationCode ?: "–"}")
            } }
        }
        p.voiceTranscript?.let { transcript ->
            item { Card { Column(Modifier.padding(16.dp)) {
                Text("Sprachtranskript", style = MaterialTheme.typography.titleLarge)
                Text(transcript)
            } } }
        }
        p.notes?.let { notes ->
            item { Card { Column(Modifier.padding(16.dp)) {
                Text("Bemerkungen", style = MaterialTheme.typography.titleLarge)
                Text(notes)
            } } }
        }
    }
}
