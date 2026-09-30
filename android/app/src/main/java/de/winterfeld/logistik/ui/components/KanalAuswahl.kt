package de.winterfeld.logistik.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.remote.dto.KanalDto
import kotlinx.coroutines.launch
import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Locale

/**
 * „Wo verkaufen?“ – Häkchen je Vertriebskanal (eigener Shop, eBay, Amazon,
 * Kleinanzeigen …). Jede Änderung wird sofort gespeichert; veröffentlicht wird
 * erst bei der Freigabe im Lager-Web. Ohne Verbindung bleibt ein Hinweis stehen,
 * die Erfassung selbst geht nicht verloren.
 */
@Composable
fun KanalAuswahl(
    produktId: String,
    gewaehltAnfang: List<String>,
    laden: suspend () -> List<KanalDto>,
    setzen: suspend (List<String>) -> List<String>,
    /** Festen Preis je Kanal setzen (Auswahl, Kanal, Preis; "" = Aufschlag verwenden). */
    preisSetzen: (suspend (List<String>, String, String) -> Unit)? = null,
    /** Ändert sich dieser Wert (z. B. der Verkaufspreis), werden die Preise neu geladen. */
    neuLadenBei: Any? = null,
) {
    var kanaele by remember { mutableStateOf<List<KanalDto>?>(null) }
    var gewaehlt by remember(produktId) { mutableStateOf(gewaehltAnfang) }
    var hinweis by remember { mutableStateOf<String?>(null) }
    var preisDialog by remember { mutableStateOf<KanalDto?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(produktId, neuLadenBei) {
        kanaele = runCatching { laden() }.getOrElse {
            hinweis = "Kanäle konnten nicht geladen werden – später im Lager-Web wählen."
            emptyList()
        }
    }

    preisDialog?.let { kanal ->
        PreisDialog(kanal, onAbbrechen = { preisDialog = null }) { preis ->
            preisDialog = null
            val speichern = preisSetzen ?: return@PreisDialog
            scope.launch {
                runCatching { speichern(gewaehlt, kanal.id, preis); laden() }
                    .onSuccess { kanaele = it; hinweis = null }
                    .onFailure { hinweis = "Keine Verbindung – Preis nicht gespeichert." }
            }
        }
    }

    fun umschalten(id: String) {
        val vorher = gewaehlt
        val neu = if (id in gewaehlt) gewaehlt - id else gewaehlt + id
        gewaehlt = neu
        scope.launch {
            runCatching { setzen(neu) }
                .onSuccess { gewaehlt = it; hinweis = null }
                .onFailure { gewaehlt = vorher; hinweis = "Keine Verbindung – Auswahl nicht gespeichert." }
        }
    }

    Card(Modifier.fillMaxWidth().testTag("kanal-auswahl")) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Wo verkaufen?", style = MaterialTheme.typography.titleMedium)
            val liste = kanaele
            when {
                liste == null -> Text("Kanäle werden geladen …",
                                      color = MaterialTheme.colorScheme.outline)
                liste.isEmpty() && hinweis == null -> Text(
                    "Noch keine Kanäle eingerichtet (Lager-Web → Shop-Verbindungen).",
                    color = MaterialTheme.colorScheme.outline)
                else -> liste.forEach { kanal ->
                    Row(Modifier.fillMaxWidth().clickable { umschalten(kanal.id) },
                        verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = kanal.id in gewaehlt, onCheckedChange = { umschalten(kanal.id) })
                        Column(Modifier.weight(1f)) {
                            Text(kanal.name)
                            Text(if (kanal.manuell) "${kanal.portal} · Anzeige von Hand einstellen"
                                 else kanal.portal,
                                 style = MaterialTheme.typography.bodySmall,
                                 color = MaterialTheme.colorScheme.outline)
                            kanal.preis?.let { preis ->
                                Text("${euro(preis)} · ${preisRegel(kanal)}",
                                     style = MaterialTheme.typography.bodySmall,
                                     modifier = Modifier.testTag("kanal-preis-${kanal.id}"))
                            }
                        }
                        if (preisSetzen != null && kanal.preis != null) {
                            TextButton(onClick = { preisDialog = kanal }) { Text("Preis") }
                        }
                    }
                }
            }
            hinweis?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (!liste.isNullOrEmpty()) {
                Text("Veröffentlicht wird bei der Freigabe im Lager-Web.",
                     style = MaterialTheme.typography.bodySmall,
                     color = MaterialTheme.colorScheme.outline)
            }
        }
    }
}


private val EURO = NumberFormat.getCurrencyInstance(Locale.GERMANY)

internal fun euro(betrag: String): String =
    runCatching { EURO.format(BigDecimal(betrag)) }.getOrDefault("$betrag €")

/** „fester Preis“ oder z. B. „Verkaufspreis + 12 %, auf ,99“. */
internal fun preisRegel(kanal: KanalDto): String {
    if (kanal.preisFest != null) return "fester Preis"
    val aufschlag = kanal.preisAufschlag?.toBigDecimalOrNull()?.stripTrailingZeros() ?: BigDecimal.ZERO
    val runden = if (kanal.preisRunden == true) ", auf ,99" else ""
    return when {
        aufschlag.signum() > 0 -> "Verkaufspreis + ${aufschlag.toPlainString().replace('.', ',')} %$runden"
        aufschlag.signum() < 0 -> "Verkaufspreis − ${aufschlag.negate().toPlainString().replace('.', ',')} %$runden"
        else -> "Verkaufspreis$runden"
    }
}

/** Eingabe „12,99“ → "12.99"; leer → ""; ungültig → null. */
internal fun preisEingabe(text: String): String? {
    val t = text.trim().replace("€", "").trim()
    if (t.isEmpty()) return ""
    val zahl = t.replace(".", "").replace(",", ".").toBigDecimalOrNull() ?: return null
    return if (zahl.signum() > 0) zahl.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString() else null
}

@Composable
private fun PreisDialog(kanal: KanalDto, onAbbrechen: () -> Unit, onSpeichern: (String) -> Unit) {
    var text by remember(kanal.id) {
        mutableStateOf(kanal.preisFest?.replace('.', ',') ?: "")
    }
    val gueltig = preisEingabe(text)
    AlertDialog(
        onDismissRequest = onAbbrechen,
        title = { Text("Preis bei ${kanal.name}") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Leer lassen = ${preisRegel(kanal.copy(preisFest = null))}.",
                     style = MaterialTheme.typography.bodySmall)
                OutlinedTextField(
                    value = text, onValueChange = { text = it },
                    label = { Text("Fester Preis in €") },
                    placeholder = { Text(kanal.preis?.let { euro(it) } ?: "") },
                    singleLine = true, isError = gueltig == null,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth().testTag("kanal-preis-eingabe"),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { gueltig?.let(onSpeichern) }, enabled = gueltig != null) { Text("Speichern") }
        },
        dismissButton = {
            Row {
                if (kanal.preisFest != null) {
                    TextButton(onClick = { onSpeichern("") }) { Text("Aufschlag verwenden") }
                }
                TextButton(onClick = onAbbrechen) { Text("Abbrechen") }
            }
        },
    )
}
