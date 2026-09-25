package de.winterfeld.logistik.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage

/** Großer Touch-Button (72 dp hoch) für die Hauptaktion eines Bildschirms. */
@Composable
fun BigButton(text: String, modifier: Modifier = Modifier, enabled: Boolean = true,
              icon: ImageVector? = null, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled,
           modifier = modifier.fillMaxWidth().heightIn(min = 64.dp)) {
        if (icon != null) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(26.dp))
            Box(Modifier.width(10.dp))
        }
        Text(text, style = MaterialTheme.typography.titleLarge)
    }
}

/** Kopfzeile mit Titel und — außer auf der Startseite — Zurück-Pfeil. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppTopBar(title: String, onBack: (() -> Unit)? = null,
              actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(
        title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis,
                       style = MaterialTheme.typography.titleLarge) },
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                }
            }
        },
        actions = actions,
        // Abstand zu Status-/Navigationsleiste regelt MainActivity für alle Seiten.
        windowInsets = WindowInsets(0, 0, 0, 0),
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.background),
    )
}

/** Kleine Überschrift über einer Gruppe von Listenzeilen. */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(text.uppercase(), modifier = modifier.padding(start = 4.dp, top = 8.dp),
         style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
         color = MaterialTheme.colorScheme.outline)
}

/** Weiße Karte, in der Listenzeilen durch feine Linien getrennt untereinander stehen. */
@Composable
fun ListCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier.fillMaxWidth(),
         colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
         elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
        Column(content = content)
    }
}

@Composable
fun ListDivider() = HorizontalDivider(Modifier.padding(start = 16.dp),
                                      color = MaterialTheme.colorScheme.outlineVariant)

/**
 * Eine Zeile zum Antippen: Symbol, Titel mit Untertitel, rechts ein Wert und
 * ein Pfeil. Mindestens 64 dp hoch, damit sie sich auch mit Handschuhen trifft.
 */
@Composable
fun ListRow(
    title: String,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    iconTint: Color = MaterialTheme.colorScheme.primary,
    showChevron: Boolean = true,
    titleMaxLines: Int = 2,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (RowScope.() -> Unit)? = null,
) {
    Row(
        modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (icon != null) {
            Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(26.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge,
                 fontWeight = FontWeight.Medium, maxLines = titleMaxLines, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) {
                Text(subtitle, style = MaterialTheme.typography.bodyMedium,
                     color = MaterialTheme.colorScheme.outline,
                     maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        trailing?.invoke(this)
        if (onClick != null && showChevron) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null,
                 tint = MaterialTheme.colorScheme.outline)
        }
    }
}

/** Zahl in einer farbigen Pille, z. B. Anzahl zu prüfender Artikel. */
@Composable
fun CountPill(count: Int?, highlight: Boolean = false) {
    val (bg, fg) = if (highlight && (count ?: 0) > 0)
        MaterialTheme.colorScheme.error to Color.White
    else MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurface
    Text(count?.toString() ?: "–",
         modifier = Modifier.clip(RoundedCornerShape(50)).background(bg)
             .padding(horizontal = 12.dp, vertical = 2.dp),
         color = fg, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Bold)
}

@Composable
fun StatusChip(status: Labels.Status) {
    val (bg, fg) = when (status.ton) {
        Labels.Ton.GUT -> Color(0xFFDDF3E9) to Color(0xFF0C6647)
        Labels.Ton.WARNUNG -> Color(0xFFFFF1D6) to Color(0xFF8A5300)
        Labels.Ton.FEHLER -> Color(0xFFFDE3E1) to Color(0xFFB42318)
        Labels.Ton.NEUTRAL -> Color(0xFFE8ECF1) to Color(0xFF475467)
    }
    Text(status.text, maxLines = 1,
         modifier = Modifier.clip(RoundedCornerShape(50)).background(bg)
             .padding(horizontal = 10.dp, vertical = 3.dp),
         color = fg, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
}

/**
 * Artikelbild in fester Größe. Ohne Bild (oder in der Vorschau, die nichts
 * aus dem Netz lädt) erscheint eine graue Fläche mit dem Anfangsbuchstaben.
 */
@Composable
fun Thumbnail(url: String?, fallbackText: String, size: Dp, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(10.dp)
    Box(modifier.size(size).clip(shape).background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center) {
        Text(fallbackText.take(1).uppercase(), style = MaterialTheme.typography.titleLarge,
             color = MaterialTheme.colorScheme.outline)
        if (url != null && !LocalInspectionMode.current) {
            AsyncImage(model = url, contentDescription = null,
                       contentScale = ContentScale.Crop, modifier = Modifier.size(size))
        }
    }
}

/** Sync-Anzeige: "Alles hochgeladen" / "N Aufnahmen warten auf Upload". */
@Composable
fun SyncBadge(pendingCount: Int, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (pendingCount == 0) {
            Icon(SyncIcons.CloudDone, contentDescription = null,
                 tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(22.dp))
            Text("Alles hochgeladen", color = MaterialTheme.colorScheme.secondary)
        } else {
            Icon(SyncIcons.Cloud, contentDescription = null,
                 tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(22.dp))
            Text(syncText(pendingCount), color = MaterialTheme.colorScheme.error)
        }
    }
}

fun syncText(pendingCount: Int): String = when (pendingCount) {
    0 -> "Alles hochgeladen"
    1 -> "1 Aufnahme wartet auf Upload"
    else -> "$pendingCount Aufnahmen warten auf Upload"
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
