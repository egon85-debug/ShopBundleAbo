package de.winterfeld.logistik.capture

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.remote.dto.AnswerDto
import de.winterfeld.logistik.data.remote.dto.ConfirmResultDto
import de.winterfeld.logistik.data.remote.dto.ProductDto
import de.winterfeld.logistik.data.remote.dto.QuestionDto
import de.winterfeld.logistik.ui.components.BigButton
import de.winterfeld.logistik.ui.components.ConfidenceChip
import de.winterfeld.logistik.ui.components.Labels

/**
 * Kontrollbildschirm (Anforderung 11): kompakte Übersicht, unsichere Felder markiert,
 * Rückfragen inline, Ein-Tipp-Korrekturen. Aktionen:
 * [Speichern] [Bearbeiten] [Weitere Fotos] [Erneut sprechen] [Shop vorbereiten]
 */
@Composable
fun ReviewScreen(
    product: ProductDto?,
    duplicates: ConfirmResultDto?,
    savedFlash: Boolean,
    onAnswer: (AnswerDto) -> Unit,
    onEditField: (field: String, value: String) -> Unit,
    onMorePhotos: () -> Unit,
    onSpeakAgain: () -> Unit,
    onSave: () -> Unit,
    onDuplicateAction: (action: String, duplicateId: String?) -> Unit,
) {
    if (savedFlash) {
        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center,
               horizontalAlignment = Alignment.CenterHorizontally) {
            Text("✓ Artikel gespeichert", style = MaterialTheme.typography.displayLarge,
                 color = MaterialTheme.colorScheme.secondary)
        }
        return
    }

    duplicates?.let { result ->
        DuplicateDialog(result, onDuplicateAction)
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
           verticalArrangement = Arrangement.spacedBy(12.dp)) {

        if (product == null) {
            Text("Verarbeitung läuft …", style = MaterialTheme.typography.headlineMedium)
            Text("Die Erfassung ist gespeichert. Erkannte Daten erscheinen hier, " +
                 "sobald die Verarbeitung abgeschlossen ist — auch offline geht nichts verloren.")
        } else {
            Text(product.productName ?: "Unbenannter Artikel",
                 style = MaterialTheme.typography.headlineMedium)
            Text(product.internalSku, color = MaterialTheme.colorScheme.primary)

            Card {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    FieldRow("EAN", product.ean, product, "ean", onEditField)
                    FieldRow("Hersteller", product.manufacturer, product, "manufacturer", onEditField)
                    FieldRow("Modell", product.model, product, "model", onEditField)
                    FieldRow("Kategorie", product.category, product, "category", onEditField)
                    HorizontalDivider()
                    FieldRow("Bestand", product.stockQuantity.toString(), product,
                             "stock_quantity", onEditField)
                    FieldRow("Einkauf netto", product.purchasePriceNet?.plus(" €"), product,
                             "purchase_price_net", onEditField)
                    FieldRow("Verkaufspreis", product.salePrice?.plus(" €"), product,
                             "sale_price", onEditField)
                    FieldRow("Lieferant", product.supplierName, product, null, onEditField)
                    FieldRow("Lagerplatz", product.storageLocationCode, product, null, onEditField)
                    // Zustand hat feste Werte — ändern in der Artikelansicht (Auswahlliste).
                    FieldRow("Zustand", Labels.zustand(product.condition), product, null, onEditField)
                    if (product.lowestMarketPrice != null) {
                        HorizontalDivider()
                        Text("Marktpreis: ${product.lowestMarketPrice}–" +
                             "${product.highestMarketPrice} € " +
                             "(Ø ${product.averageMarketPrice ?: "–"} €)")
                        product.recommendedSalePrice?.let {
                            Text("Vorgeschlagener Verkaufspreis: $it €",
                                 color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }

            product.openQuestions.orEmpty().forEach { question ->
                QuestionCard(question, onAnswer)
            }
        }

        BigButton("Speichern") { onSave() }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = onMorePhotos, modifier = Modifier.weight(1f)) {
                Text("Weitere Fotos") }
            OutlinedButton(onClick = onSpeakAgain, modifier = Modifier.weight(1f)) {
                Text("Erneut sprechen") }
        }
    }
}

@Composable
private fun FieldRow(label: String, value: String?, product: ProductDto,
                     editableField: String?, onEditField: (String, String) -> Unit) {
    var editing by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf(value ?: "") }

    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium,
                 color = MaterialTheme.colorScheme.outline)
            if (editing && editableField != null) {
                OutlinedTextField(value = text, onValueChange = { text = it },
                    modifier = Modifier.fillMaxWidth())
                Row {
                    TextButton(onClick = { editing = false
                                           onEditField(editableField, text) }) { Text("OK") }
                    TextButton(onClick = { editing = false }) { Text("Abbrechen") }
                }
            } else {
                Text(value ?: "–", style = MaterialTheme.typography.bodyLarge)
                editableField?.let { field ->
                    ConfidenceChip(product.fieldConfidence?.get(field),
                                   product.fieldSources?.get(field))
                }
            }
        }
        if (editableField != null && !editing) {
            TextButton(onClick = { editing = true; text = value ?: "" }) { Text("Ändern") }
        }
    }
}

@Composable
private fun QuestionCard(question: QuestionDto, onAnswer: (AnswerDto) -> Unit) {
    var text by remember { mutableStateOf("") }
    Card {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("❓ ${question.text}", style = MaterialTheme.typography.bodyLarge,
                 fontWeight = FontWeight.SemiBold)
            when (question.kind) {
                "choice" -> question.options.orEmpty().forEach { option ->
                    Button(onClick = { onAnswer(AnswerDto(
                        questionId = question.id, field = question.field,
                        value = option.toString())) },
                        modifier = Modifier.fillMaxWidth()) { Text(option.toString()) }
                }
                "candidate_select" -> question.options.orEmpty().forEachIndexed { index, option ->
                    @Suppress("UNCHECKED_CAST")
                    val candidate = option as? Map<String, Any?> ?: return@forEachIndexed
                    OutlinedButton(onClick = { onAnswer(AnswerDto(
                        questionId = question.id, selectedCandidateIndex = index)) },
                        modifier = Modifier.fillMaxWidth()) {
                        Text("${candidate["product_name"] ?: "?"} · " +
                             "${candidate["manufacturer"] ?: ""} · EAN ${candidate["ean"] ?: "–"}")
                    }
                }
                else -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(value = text, onValueChange = { text = it },
                        modifier = Modifier.weight(1f))
                    Button(onClick = { onAnswer(AnswerDto(questionId = question.id,
                        field = question.field, value = text)) }) { Text("OK") }
                }
            }
        }
    }
}

@Composable
private fun DuplicateDialog(result: ConfirmResultDto,
                            onAction: (String, String?) -> Unit) {
    AlertDialog(
        onDismissRequest = {},
        title = { Text("Artikel möglicherweise bereits vorhanden") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                result.duplicates.orEmpty().forEach { duplicate ->
                    Card {
                        Column(Modifier.padding(12.dp)) {
                            Text(duplicate.productName ?: duplicate.internalSku,
                                 style = MaterialTheme.typography.titleLarge)
                            Text("EAN: ${duplicate.ean ?: "–"} · Bestand: " +
                                 "${duplicate.stockQuantity} · Lagerplatz: " +
                                 "${duplicate.storageLocationCode ?: "–"}")
                            Text(duplicate.matchReason,
                                 color = MaterialTheme.colorScheme.primary)
                            Button(onClick = {
                                onAction("increase_stock", duplicate.productId) },
                                modifier = Modifier.padding(top = 8.dp)) {
                                Text("Bestand erhöhen") }
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onAction("create_anyway", null) }) {
                Text("Trotzdem neuen Artikel erstellen") }
        },
    )
}
