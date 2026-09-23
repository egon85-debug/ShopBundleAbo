package de.winterfeld.logistik.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.remote.dto.LocationDto
import de.winterfeld.logistik.data.remote.dto.AnswerDto
import de.winterfeld.logistik.data.remote.dto.ProductDto
import de.winterfeld.logistik.data.remote.dto.QuestionDto
import de.winterfeld.logistik.data.remote.dto.SupplierDto
import de.winterfeld.logistik.data.repo.ProductRepository
import de.winterfeld.logistik.ui.components.AppTopBar
import de.winterfeld.logistik.ui.components.Labels
import de.winterfeld.logistik.ui.components.ListCard
import de.winterfeld.logistik.ui.components.ListDivider
import de.winterfeld.logistik.ui.components.ListRow
import de.winterfeld.logistik.ui.components.SectionHeader
import de.winterfeld.logistik.ui.components.StatusChip
import de.winterfeld.logistik.ui.components.Thumbnail
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import retrofit2.HttpException

// ─── Artikelliste ────────────────────────────────────────────────────────────

/** Filter der Artikelliste; "published" steckt beim Server im Veröffentlichungsstatus. */
val PRODUCT_FILTERS = listOf(
    null to "Alle", "review_required" to "Zu prüfen",
    "shop_ready" to "Shopbereit", "published" to "Veröffentlicht",
)

@Composable
fun ProductListScreen(products: ProductRepository, baseUrl: String, initialFilter: String? = null,
                      onBack: () -> Unit, onOpen: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var filter by rememberSaveable { mutableStateOf(initialFilter) }
    var items by remember { mutableStateOf<List<ProductDto>>(emptyList()) }
    var total by remember { mutableStateOf(0) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    suspend fun laden(offset: Int) {
        loading = true
        try {
            val page = products.list(query.ifBlank { null }, filter, offset)
            // Kommen zwischendurch neue Artikel dazu, verschieben sich die Seiten und
            // ein Artikel käme doppelt — die Liste verträgt keine doppelten Schlüssel.
            items = if (offset == 0) page.items else (items + page.items).distinctBy { it.id }
            total = page.total
            error = null
        } catch (_: Exception) {
            error = "Keine Verbindung zum Server. Bitte später erneut versuchen."
        } finally { loading = false }
    }

    LaunchedEffect(query, filter, reload) {
        // Beim Tippen erst suchen, wenn kurz Ruhe ist (jeder Tastendruck bricht ab).
        if (query.isNotEmpty()) delay(350)
        laden(0)
    }

    ProductListContent(
        query = query, onQueryChange = { query = it },
        filter = filter, onFilterChange = { filter = it },
        items = items, total = total, loading = loading, error = error, baseUrl = baseUrl,
        onBack = onBack, onOpen = onOpen, onReload = { reload++ },
        onLoadMore = { scope.launch { laden(items.size) } },
    )
}

@Composable
fun ProductListContent(
    query: String, onQueryChange: (String) -> Unit,
    filter: String?, onFilterChange: (String?) -> Unit,
    items: List<ProductDto>, total: Int, loading: Boolean, error: String?, baseUrl: String,
    onBack: () -> Unit, onOpen: (String) -> Unit, onReload: () -> Unit, onLoadMore: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        AppTopBar("Artikel", onBack = onBack) {
            IconButton(onClick = onReload) {
                Icon(Icons.Default.Refresh, contentDescription = "Neu laden")
            }
        }
        OutlinedTextField(
            value = query, onValueChange = onQueryChange,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            placeholder = { Text("Name, SKU, EAN, Hersteller") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
            trailingIcon = {
                if (query.isNotEmpty()) IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Default.Clear, contentDescription = "Suche leeren")
                }
            },
            singleLine = true,
        )
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(PRODUCT_FILTERS) { (value, label) ->
                FilterChip(selected = filter == value, onClick = { onFilterChange(value) },
                           label = { Text(label) })
            }
        }
        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error,
                 modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                   modifier = Modifier.fillMaxSize()) {
            if (items.isNotEmpty()) {
                item {
                    Text(if (total == 1) "1 Artikel" else "$total Artikel",
                         color = MaterialTheme.colorScheme.outline,
                         style = MaterialTheme.typography.bodyMedium,
                         modifier = Modifier.padding(start = 4.dp, bottom = 6.dp))
                }
            }
            items(items, key = { it.id }) { product ->
                ProductListItem(product, baseUrl) { onOpen(product.id) }
            }
            if (items.size < total) {
                item {
                    OutlinedButton(onClick = onLoadMore, enabled = !loading,
                                   modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) {
                        Text("Weitere ${minOf(50, total - items.size)} laden")
                    }
                }
            }
            if (items.isEmpty() && !loading && error == null) {
                item {
                    Text(if (query.isBlank()) "Hier gibt es noch keine Artikel."
                         else "Nichts gefunden für „$query“.",
                         color = MaterialTheme.colorScheme.outline,
                         modifier = Modifier.padding(top = 24.dp))
                }
            }
            if (loading && items.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().padding(top = 32.dp),
                        contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                }
            }
        }
    }
}

/** Eine Zeile der Liste: Bild, Name, SKU/Lagerplatz, Status und Bestand. */
@Composable
private fun ProductListItem(product: ProductDto, baseUrl: String, onClick: () -> Unit) {
    val name = product.productName ?: "Unbenannter Artikel"
    val shape = MaterialTheme.shapes.medium
    Card(
        Modifier.fillMaxWidth().padding(bottom = 8.dp).clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        shape = shape,
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically) {
            Thumbnail(Labels.bildUrl(baseUrl, Labels.vorschaubild(product.images)?.url),
                      fallbackText = product.productName ?: "?", size = 64.dp)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(name, style = MaterialTheme.typography.bodyLarge,
                     fontWeight = FontWeight.SemiBold, maxLines = 2,
                     overflow = TextOverflow.Ellipsis,
                     color = if (product.productName == null) MaterialTheme.colorScheme.outline
                             else MaterialTheme.colorScheme.onSurface)
                Text(listOfNotNull(product.internalSku, product.storageLocationCode)
                         .joinToString(" · "),
                     style = MaterialTheme.typography.bodyMedium,
                     color = MaterialTheme.colorScheme.outline, maxLines = 1,
                     overflow = TextOverflow.Ellipsis)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    StatusChip(Labels.status(product))
                    Text("Bestand ${product.stockQuantity}",
                         style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

// ─── Artikel-Detail mit Bearbeiten ───────────────────────────────────────────

enum class FeldArt { TEXT, ZIFFERN, PREIS, MEHRZEILIG, ZUSTAND, LAGERPLATZ, LIEFERANT }

/** Ein bearbeitbares Feld; [key] ist der Feldname im PATCH des Servers. */
data class Feld(val key: String, val label: String, val art: FeldArt = FeldArt.TEXT)

val FELDER_ARTIKEL = listOf(
    Feld("product_name", "Name"),
    Feld("manufacturer", "Hersteller"),
    Feld("brand", "Marke"),
    Feld("model", "Modell"),
    Feld("ean", "EAN / Barcode", FeldArt.ZIFFERN),
    Feld("mpn", "Herstellernummer (MPN)"),
    Feld("category", "Kategorie"),
    Feld("condition", "Zustand", FeldArt.ZUSTAND),
    Feld("packaging_condition", "Verpackung"),
)
val FELDER_PREISE = listOf(
    Feld("purchase_price_net", "Einkaufspreis netto", FeldArt.PREIS),
    Feld("sale_price", "Verkaufspreis", FeldArt.PREIS),
)
val FELDER_LAGER = listOf(
    Feld("storage_location_id", "Lagerplatz", FeldArt.LAGERPLATZ),
    Feld("supplier_id", "Lieferant", FeldArt.LIEFERANT),
)
val FELD_NOTIZEN = Feld("notes", "Bemerkungen", FeldArt.MEHRZEILIG)

/** Anzeigewert eines Felds; null heißt "nicht ausgefüllt". */
fun feldWert(p: ProductDto, feld: Feld): String? = when (feld.key) {
    "product_name" -> p.productName
    "manufacturer" -> p.manufacturer
    "brand" -> p.brand
    "model" -> p.model
    "ean" -> p.ean
    "mpn" -> p.mpn
    "category" -> p.category
    "condition" -> Labels.zustand(p.condition)
    "packaging_condition" -> p.packagingCondition
    "purchase_price_net" -> p.purchasePriceNet?.let(Labels::preis)
    "sale_price" -> p.salePrice?.let(Labels::preis)
    "storage_location_id" -> p.storageLocationCode
    "supplier_id" -> p.supplierName
    "notes" -> p.notes
    else -> null
}.takeUnless { it.isNullOrBlank() }

@Composable
fun ProductDetailScreen(products: ProductRepository, productId: String, baseUrl: String,
                        onBack: () -> Unit) {
    var product by remember { mutableStateOf<ProductDto?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Feld?>(null) }
    var question by remember { mutableStateOf<QuestionDto?>(null) }
    var locations by remember { mutableStateOf<List<LocationDto>?>(null) }
    var suppliers by remember { mutableStateOf<List<SupplierDto>?>(null) }
    var reload by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(productId, reload) {
        try { product = products.get(productId); error = null }
        catch (_: Exception) { error = "Artikel konnte nicht geladen werden (keine Verbindung?)" }
    }
    LaunchedEffect(editing) {
        when (editing?.art) {
            FeldArt.LAGERPLATZ -> if (locations == null) locations =
                runCatching { products.storageLocations() }.getOrDefault(emptyList())
            FeldArt.LIEFERANT -> if (suppliers == null) suppliers =
                runCatching { products.suppliers() }.getOrDefault(emptyList())
            else -> {}
        }
    }

    /** Führt eine Änderung am Server aus; Fehler landen lesbar über der Liste. */
    fun senden(aktion: suspend () -> ProductDto) {
        saving = true
        scope.launch {
            try {
                product = aktion()
                error = null
            } catch (e: HttpException) {
                error = when (e.code()) {
                    403 -> "Nur eigene Erfassungen dürfen geändert werden."
                    422 -> "Der Server hat den Wert nicht angenommen: " + serverMeldung(e)
                    else -> "Speichern fehlgeschlagen (Fehler ${e.code()})."
                }
            } catch (_: Exception) {
                error = "Keine Verbindung — nicht gespeichert."
            } finally {
                saving = false
                editing = null
                question = null
            }
        }
    }
    fun speichern(fields: Map<String, Any?>) = senden { products.patch(productId, fields) }
    fun antworten(answer: AnswerDto) = senden { products.answer(productId, answer) }

    val p = product
    Column(Modifier.fillMaxSize()) {
        AppTopBar(p?.let { it.productName ?: it.internalSku } ?: "Artikel", onBack = onBack) {
            IconButton(onClick = { reload++ }) {
                Icon(Icons.Default.Refresh, contentDescription = "Neu laden")
            }
        }
        if (p == null) {
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.TopCenter) {
                if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
                else CircularProgressIndicator()
            }
        } else {
            ProductDetailContent(p, baseUrl, error, onEdit = { editing = it },
                onQuestion = { question = it },
                onUseRecommended = { price -> speichern(mapOf("sale_price" to price)) })
        }
    }

    val feld = editing
    if (p != null && feld != null) {
        FeldDialog(feld, p, saving, locations, suppliers,
                   onDismiss = { if (!saving) editing = null }, onSave = ::speichern)
    }
    val frage = question
    if (frage != null) {
        FrageDialog(frage, saving, onDismiss = { if (!saving) question = null },
                    onAnswer = ::antworten)
    }
}

/** Die Meldung aus {"detail": "…"} des Servers, sonst leer. */
private fun serverMeldung(e: HttpException): String {
    val body = runCatching { e.response()?.errorBody()?.string() }.getOrNull() ?: return ""
    return Regex("\"detail\"\\s*:\\s*\"([^\"]+)\"").find(body)?.groupValues?.get(1) ?: ""
}

@Composable
fun ProductDetailContent(p: ProductDto, baseUrl: String, error: String?,
                         onEdit: (Feld) -> Unit, onQuestion: (QuestionDto) -> Unit,
                         onUseRecommended: (String) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().testTag("artikel-detail"),
               contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 32.dp),
               verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val bilder = Labels.galerie(p.images)
        if (bilder.isNotEmpty()) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(bilder, key = { it.id }) { bild ->
                        Thumbnail(Labels.bildUrl(baseUrl, bild.url),
                                  fallbackText = p.productName ?: "?", size = 132.dp)
                    }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(p.productName ?: "Unbenannter Artikel",
                     style = MaterialTheme.typography.headlineMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    StatusChip(Labels.status(p))
                    Text(p.internalSku, color = MaterialTheme.colorScheme.outline)
                }
                Text("Zum Ändern eine Zeile antippen.",
                     style = MaterialTheme.typography.bodyMedium,
                     color = MaterialTheme.colorScheme.outline)
            }
        }
        error?.let { item { Text(it, color = MaterialTheme.colorScheme.error) } }

        val fragen = p.openQuestions.orEmpty()
        if (fragen.isNotEmpty()) {
            item { SectionHeader("Offene Fragen") }
            item {
                ListCard {
                    fragen.forEachIndexed { i, frage ->
                        if (i > 0) ListDivider()
                        ListRow(frage.text, icon = Icons.Default.Warning,
                                iconTint = MaterialTheme.colorScheme.error,
                                subtitle = "Antippen zum Beantworten", titleMaxLines = 5,
                                onClick = { onQuestion(frage) })
                    }
                }
            }
        }

        item { SectionHeader("Artikel") }
        item { FeldKarte(p, FELDER_ARTIKEL, onEdit) }

        item { SectionHeader("Preise") }
        item {
            ListCard {
                FELDER_PREISE.forEach { feld ->
                    FeldZeile(p, feld, onEdit)
                    ListDivider()
                }
                val empfohlen = p.recommendedSalePrice
                if (p.lowestMarketPrice != null || empfohlen != null) {
                    ListRow(
                        title = "Marktpreis " + if (p.lowestMarketPrice != null)
                            "${Labels.preis(p.lowestMarketPrice)} – ${Labels.preis(p.highestMarketPrice)}"
                            else "unbekannt",
                        subtitle = empfohlen?.let { "Empfohlen: ${Labels.preis(it)}" },
                    ) {
                        if (empfohlen != null && empfohlen != p.salePrice) {
                            TextButton(onClick = { onUseRecommended(empfohlen) }) {
                                Text("Übernehmen")
                            }
                        }
                    }
                } else {
                    ListRow("Marktpreis", subtitle = "Noch keine Preisrecherche")
                }
            }
        }

        item { SectionHeader("Lager") }
        item {
            ListCard {
                ListRow("Bestand: ${p.stockQuantity}",
                        subtitle = "davon verfügbar ${p.availableQuantity} · " +
                                   "Änderung nur über Lagerbewegung im Admin")
                FELDER_LAGER.forEach { feld ->
                    ListDivider()
                    FeldZeile(p, feld, onEdit)
                }
            }
        }

        item { SectionHeader("Notizen") }
        item {
            ListCard {
                FeldZeile(p, FELD_NOTIZEN, onEdit)
                p.voiceTranscript?.takeIf { it.isNotBlank() }?.let {
                    ListDivider()
                    ListRow("Gesprochen bei der Aufnahme", subtitle = "„$it“")
                }
            }
        }
    }
}

@Composable
private fun FeldKarte(p: ProductDto, felder: List<Feld>, onEdit: (Feld) -> Unit) {
    ListCard {
        felder.forEachIndexed { i, feld ->
            if (i > 0) ListDivider()
            FeldZeile(p, feld, onEdit)
        }
    }
}

/** Beschriftung oben, Wert darunter, Stift rechts; unsichere KI-Werte markiert. */
@Composable
private fun FeldZeile(p: ProductDto, feld: Feld, onEdit: (Feld) -> Unit) {
    val wert = feldWert(p, feld)
    val quelle = p.fieldSources?.get(feld.key.removeSuffix("_id"))
    val sicherheit = p.fieldConfidence?.get(feld.key.removeSuffix("_id"))
    val unsicher = quelle != "user" && sicherheit != null && sicherheit < 0.85
    Row(Modifier.fillMaxWidth().clickable { onEdit(feld) }.heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f)) {
            Text(feld.label, style = MaterialTheme.typography.bodyMedium,
                 color = MaterialTheme.colorScheme.outline)
            Text(wert ?: "nicht angegeben", style = MaterialTheme.typography.bodyLarge,
                 fontWeight = if (wert != null) FontWeight.Medium else FontWeight.Normal,
                 color = if (wert != null) MaterialTheme.colorScheme.onSurface
                         else MaterialTheme.colorScheme.outline,
                 maxLines = if (feld.art == FeldArt.MEHRZEILIG) 6 else 2,
                 overflow = TextOverflow.Ellipsis)
            if (unsicher) {
                Text("⚠ von der KI geschätzt, bitte prüfen",
                     style = MaterialTheme.typography.bodyMedium,
                     color = MaterialTheme.colorScheme.error)
            }
        }
        Icon(Icons.Default.Edit, contentDescription = "${feld.label} ändern",
             tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
    }
}

// ─── Bearbeiten-Dialog ───────────────────────────────────────────────────────

@Composable
private fun FeldDialog(
    feld: Feld, p: ProductDto, saving: Boolean,
    locations: List<LocationDto>?, suppliers: List<SupplierDto>?,
    onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit,
) {
    when (feld.art) {
        FeldArt.ZUSTAND -> AuswahlDialog(
            feld.label, Labels.ZUSTAENDE, selected = p.condition, saving = saving,
            onDismiss = onDismiss) { onSave(mapOf("condition" to it)) }

        FeldArt.LAGERPLATZ -> AuswahlDialog(
            feld.label,
            locations?.let { list -> listOf<Pair<String?, String>>(null to "Kein Lagerplatz") +
                list.map { it.id to "${it.code} · ${it.name}" } },
            selected = locations?.firstOrNull { it.code == p.storageLocationCode }?.id,
            saving = saving, emptyHint = "Noch keine Lagerplätze angelegt (im Admin-Bereich).",
            onDismiss = onDismiss) { onSave(mapOf("storage_location_id" to it)) }

        FeldArt.LIEFERANT -> LieferantDialog(p, suppliers, saving, onDismiss, onSave)

        else -> TextDialog(feld, p, saving, onDismiss, onSave)
    }
}

@Composable
private fun TextDialog(feld: Feld, p: ProductDto, saving: Boolean,
                       onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
    val rohwert = when (feld.key) {
        "purchase_price_net" -> p.purchasePriceNet?.replace('.', ',')
        "sale_price" -> p.salePrice?.replace('.', ',')
        else -> feldWert(p, feld)
    }
    var text by remember { mutableStateOf(rohwert ?: "") }
    var fehler by remember { mutableStateOf<String?>(null) }

    fun uebernehmen() {
        val wert: String? = try {
            when (feld.art) {
                FeldArt.PREIS -> Labels.preisEingabe(text)
                else -> text.trim().ifEmpty { null }
            }
        } catch (e: IllegalArgumentException) { fehler = e.message; return }
        onSave(mapOf(feld.key to wert))
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(feld.label) },
        text = {
            OutlinedTextField(
                value = text, onValueChange = { text = it; fehler = null },
                modifier = Modifier.fillMaxWidth(),
                singleLine = feld.art != FeldArt.MEHRZEILIG,
                minLines = if (feld.art == FeldArt.MEHRZEILIG) 4 else 1,
                isError = fehler != null,
                supportingText = {
                    Text(fehler ?: when (feld.art) {
                        FeldArt.PREIS -> "z. B. 12,50 — leer lassen zum Entfernen"
                        else -> "Leer lassen zum Entfernen"
                    })
                },
                suffix = if (feld.art == FeldArt.PREIS) ({ Text("€") }) else null,
                keyboardOptions = KeyboardOptions(
                    keyboardType = when (feld.art) {
                        FeldArt.ZIFFERN -> KeyboardType.Number
                        FeldArt.PREIS -> KeyboardType.Decimal
                        else -> KeyboardType.Text
                    },
                    capitalization = if (feld.art == FeldArt.TEXT || feld.art == FeldArt.MEHRZEILIG)
                        KeyboardCapitalization.Sentences else KeyboardCapitalization.None,
                ),
            )
        },
        confirmButton = {
            Button(onClick = ::uebernehmen, enabled = !saving) {
                Text(if (saving) "Speichert …" else "Speichern")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Abbrechen") } },
    )
}

/** Liste zum Antippen — ein Tipp speichert sofort. */
@Composable
private fun AuswahlDialog(
    title: String, options: List<Pair<String?, String>>?, selected: String?, saving: Boolean,
    emptyHint: String? = null, onDismiss: () -> Unit, onPick: (String?) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            when {
                options == null -> Box(Modifier.fillMaxWidth(), Alignment.Center) {
                    CircularProgressIndicator()
                }
                options.size <= 1 && emptyHint != null -> Column {
                    Text(emptyHint, color = MaterialTheme.colorScheme.outline)
                }
                else -> LazyColumn(Modifier.heightIn(max = 420.dp)) {
                    items(options) { (value, label) ->
                        Row(Modifier.fillMaxWidth().clickable(enabled = !saving) { onPick(value) }
                                .heightIn(min = 52.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            RadioButton(selected = value == selected, enabled = !saving,
                                        onClick = { onPick(value) })
                            Text(label, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Abbrechen") } },
    )
}

@Composable
private fun LieferantDialog(p: ProductDto, suppliers: List<SupplierDto>?, saving: Boolean,
                            onDismiss: () -> Unit, onSave: (Map<String, Any?>) -> Unit) {
    var neu by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Lieferant") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = neu, onValueChange = { neu = it },
                    label = { Text("Neuer Lieferant") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.Words))
                when {
                    suppliers == null -> CircularProgressIndicator()
                    suppliers.isNotEmpty() -> {
                        Text("oder vorhandenen wählen:", color = MaterialTheme.colorScheme.outline)
                        LazyColumn(Modifier.heightIn(max = 300.dp)) {
                            items(suppliers, key = { it.id }) { s ->
                                Row(Modifier.fillMaxWidth()
                                        .clickable(enabled = !saving) {
                                            onSave(mapOf("supplier_id" to s.id)) }
                                        .heightIn(min = 52.dp),
                                    verticalAlignment = Alignment.CenterVertically) {
                                    RadioButton(selected = s.name == p.supplierName,
                                                enabled = !saving,
                                                onClick = { onSave(mapOf("supplier_id" to s.id)) })
                                    Text(s.name, style = MaterialTheme.typography.bodyLarge)
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSave(mapOf("supplier_name" to neu.trim())) },
                   enabled = !saving && neu.isNotBlank()) { Text("Anlegen") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Abbrechen") } },
    )
}

/** Rückfrage aus der Erfassung beantworten; die Frage verschwindet danach. */
@Composable
private fun FrageDialog(frage: QuestionDto, saving: Boolean, onDismiss: () -> Unit,
                        onAnswer: (AnswerDto) -> Unit) {
    var text by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rückfrage") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(frage.text, style = MaterialTheme.typography.bodyLarge)
                when (frage.kind) {
                    "choice" -> frage.options.orEmpty().forEach { option ->
                        OutlinedButton(onClick = { onAnswer(AnswerDto(questionId = frage.id,
                            field = frage.field, value = option.toString())) },
                            enabled = !saving, modifier = Modifier.fillMaxWidth()) {
                            Text(option.toString())
                        }
                    }
                    "candidate_select" -> LazyColumn(Modifier.heightIn(max = 360.dp)) {
                        itemsIndexedCandidates(frage.options.orEmpty()) { index, label ->
                            OutlinedButton(onClick = { onAnswer(AnswerDto(questionId = frage.id,
                                selectedCandidateIndex = index)) },
                                enabled = !saving,
                                modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                                Text(label)
                            }
                        }
                    }
                    else -> OutlinedTextField(
                        value = text, onValueChange = { text = it }, singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = if (frage.kind == "number") KeyboardType.Number
                                           else KeyboardType.Text,
                            capitalization = KeyboardCapitalization.Sentences),
                    )
                }
            }
        },
        confirmButton = {
            if (frage.kind != "choice" && frage.kind != "candidate_select") {
                Button(onClick = { onAnswer(AnswerDto(questionId = frage.id, field = frage.field,
                                                      value = text.trim())) },
                       enabled = !saving && text.isNotBlank()) {
                    Text(if (saving) "Speichert …" else "Speichern")
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Später") } },
    )
}

/** Kandidaten kommen als lose JSON-Objekte; daraus eine lesbare Zeile machen. */
private fun androidx.compose.foundation.lazy.LazyListScope.itemsIndexedCandidates(
    options: List<Any>, content: @Composable (Int, String) -> Unit,
) {
    options.forEachIndexed { index, option ->
        val c = option as? Map<*, *> ?: return@forEachIndexed
        val label = listOfNotNull(c["product_name"], c["manufacturer"],
                                  c["ean"]?.let { "EAN $it" }).joinToString(" · ")
        item { content(index, label.ifEmpty { "Vorschlag ${index + 1}" }) }
    }
}
