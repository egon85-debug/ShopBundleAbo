package de.winterfeld.logistik.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.unit.dp
import de.winterfeld.logistik.data.remote.dto.KanalDto
import kotlinx.coroutines.launch

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
) {
    var kanaele by remember { mutableStateOf<List<KanalDto>?>(null) }
    var gewaehlt by remember(produktId) { mutableStateOf(gewaehltAnfang) }
    var hinweis by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(produktId) {
        kanaele = runCatching { laden() }.getOrElse {
            hinweis = "Kanäle konnten nicht geladen werden – später im Lager-Web wählen."
            emptyList()
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
                        Column {
                            Text(kanal.name)
                            Text(if (kanal.manuell) "${kanal.portal} · Anzeige von Hand einstellen"
                                 else kanal.portal,
                                 style = MaterialTheme.typography.bodySmall,
                                 color = MaterialTheme.colorScheme.outline)
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
